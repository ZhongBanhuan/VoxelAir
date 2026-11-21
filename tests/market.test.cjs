const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const ganache=require('ganache');
const E=require('../ethers.min.js');
const root=path.join(__dirname,'..');
test('multiple sellers, stale quote, refusing payee, departure and window',async t=>{
  const artifacts=JSON.parse(execFileSync(process.env.SOLC||'solc',[
    '--base-path','.','--evm-version','paris','--optimize','--combined-json','abi,bin','tests/DeclinesPayment.sol'
  ],{cwd:root,encoding:'utf8'})).contracts;
  const evm=ganache.provider({logging:{quiet:true},wallet:{totalAccounts:5}});
  t.after(()=>evm.disconnect());
  const p=new E.BrowserProvider(evm,undefined,{cacheTimeout:-1});p.pollingInterval=20;
  const [a,b,c,d]=await Promise.all([0,1,2,3].map(i=>p.getSigner(i)));
  async function deploy(file){
    const {abi,bin}=artifacts[file];
    const instance=await new E.ContractFactory(abi,'0x'+bin,a).deploy();
    await instance.waitForDeployment();return instance;
  }
  const market=await deploy('VoxelAirMarket.sol:VoxelAirMarket');
  const rejector=await deploy('tests/DeclinesPayment.sol:DeclinesPayment');
  const m=Math.ceil(((await p.getBlock('latest')).timestamp+600)/60);
  const id=(owner,salt)=>E.keccak256(E.AbiCoder.defaultAbiCoder().encode(['address','bytes32'],[owner,E.id(salt)]));
  const reserve=async(w,s,cells,price)=>{
    await (await market.connect(w).reservePath(E.id(s),m,cells,price)).wait();
    return id(await w.getAddress(),s);
  };
  const A=await reserve(a,'A',[1,2],3), C=await reserve(c,'C',[4,5],7);
  const old=await reserve(b,'alternative',[6,7],0);
  const R=id(await rejector.getAddress(),'reject');
  await (await rejector.book(await market.getAddress(),E.id('reject'),m,[8])).wait();
  const take=market.connect(b).buyoutMany;
  const before=await p.getBalance(await a.getAddress());
  const tx=await take(m,[1,4,8],[A,C,R],old,E.id('failed'),{value:15,gasLimit:800000});
  await assert.rejects(tx.wait());
  assert.equal(await market.occupant(m,6),old);
  assert.equal(await market.occupant(m,1),A);
  assert.equal(await market.occupant(m,4),C);
  assert.equal(await p.getBalance(await a.getAddress()),before);
  const takeArgs=[m,[1,2,4],[A,C],old,E.id('winner')];
  async function reason(action,name){await assert.rejects(action,e=>e.data?.slice(0,10)===market.interface.getError(name).selector)}
  await reason(take.staticCall(...takeArgs,{value:13}),'WrongPrice');
  await reason(take.staticCall(m,[1,4],[C,A],old,E.id('stale'),{value:10}),'QuoteChanged');
  await reason(take.staticCall(m,[1,4],[A,C],C,E.id('foreign'),{value:10}),'Invalid');
  const receipt=await (await take(...takeArgs,{value:10})).wait();
  assert.equal(receipt.logs.filter(l=>l.fragment?.name==='Bought').length,2);
  assert.equal(await market.occupant(m,5),E.ZeroHash);
  assert.equal(await market.occupant(m,6),E.ZeroHash);
  assert.equal(await market.occupant(m+1,4),E.ZeroHash);
  await reason(market.connect(d).buyoutMany.staticCall(m,[1,4],[A,C],E.ZeroHash,E.id('late'),{value:10}),'QuoteChanged');
  const guard=await reserve(d,'guard',[9],4);
  await (await market.connect(d).markDeparted(guard)).wait();
  await reason(take.staticCall(m,[9],[guard],E.ZeroHash,E.id('tooEarly'),{value:4}),'Locked');
  const timed=await reserve(d,'timed',[10],4);
  await evm.request({method:'evm_increaseTime',params:[m*60-89-(await p.getBlock('latest')).timestamp]});
  await evm.request({method:'evm_mine',params:[]});
  await reason(take.staticCall(m,[10],[timed],E.ZeroHash,E.id('tooLate'),{value:4}),'Locked');
});
