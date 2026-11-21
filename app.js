'use strict';
const {proof,abi}=window.VoxelAir;
const E=window.ethers, zero=E.ZeroHash, el=id=>document.getElementById(id);
const explorer='https://testnet.monadscan.com';
const rows=[
  ['reserve','A 预约巡检线','A 持有格 9、10、11，起飞前让路报价为 0.005 测试 MON。'],
  ['conflict','B 撞格，整单回滚','B 请求格 6、10、14，在格 10 遇到 A。交易回滚，格 6 和 14 都为空。'],
  ['reroute','B 换路重约','B 改订格 4、8、12，三格均归 B。A 的原预约仍然有效。'],
  ['buyout','B 买断，A 收款','同一笔交易释放两条旧预约，B 获得格 6、10、14。A 的余额增加 0.005 测试 MON。'],
  ['locked','锁定窗口拒绝买断','切换至单独的安全测试时段。A 预约的格 0、1 进入起飞前 90 秒窗口，B 的买断回滚，A 保留预约。']
];
function map(owners,conflict){
  const fragment=document.createDocumentFragment();
  for(let y=3;y>=0;y--)for(let x=0;x<4;x++){
    const n=y*4+x,who=owners[n]||'',cell=document.createElement('div');
    cell.className='cell '+(who==='A'?'a':who==='B'?'b':'')+(n===conflict?' c':'');
    cell.textContent=who||'·';cell.title='格 '+n+' ('+x+', '+y+', 0) '+(who||'空闲');
    const label=document.createElement('small');label.textContent=n;cell.append(label);fragment.append(cell);
  }
  el('map').replaceChildren(fragment);
}
function formatMinute(n){return new Date(n*60000).toLocaleString('zh-CN',{hour12:false,timeZoneName:'short'});}
function replay(index){
  const [key,title,description]=rows[index],step=proof.steps[key],snapshot={};
  for(const [k] of (key==='locked'?[rows[index]]:rows.slice(0,index+1))){
    for(const [cell,id] of Object.entries(proof.steps[k].owners)){
      snapshot[cell]=id===zero?'':id===proof.ids.seller||id===proof.ids.locked?'A':'B';
    }
  }
  map(snapshot,key==='conflict'?10:null);
  el('time').textContent=formatMinute(key==='locked'?proof.lockMinute:proof.minute)+' · 按分钟预约';
  el('stepTitle').textContent=title;el('detail').textContent=description;
  el('tx').href=explorer+'/tx/'+step.tx;el('tx').textContent='区块 '+step.block+' · 查看交易 ↗';
  Array.from(el('timeline').children).forEach((b,i)=>b.setAttribute('aria-pressed',String(index===i)));
}
rows.forEach(([,title],i)=>{const button=document.createElement('button');button.className='row';
  const number=document.createElement('i');number.textContent=String(i+1).padStart(2,'0');
  button.append(number,title);button.onclick=()=>replay(i);el('timeline').append(button);});
let provider,signer,address,busy=false,liveOwners={};
const cacheKey='voxelair-session:'+proof.contract;
function fresh(){return {id:crypto.randomUUID(),minute:Math.ceil((Date.now()/1000+900)/60)}}
function load(){try{return JSON.parse(localStorage.getItem(cacheKey))||fresh()}catch{return fresh()}}
let session=load();
function persist(){try{localStorage.setItem(cacheKey,JSON.stringify(session))}catch{}}
function startField(){const d=new Date(session.minute*60000);el('start').value=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);el('start').disabled=!!session.a;}
function liveView(){map(liveOwners,session.conflict?10:null);startField();el('price').disabled=!!session.a;
  el('time').textContent=formatMinute(session.minute)+' · 按分钟预约';el('who').textContent=address?'当前账户 '+address.slice(0,8)+'…'+address.slice(-6):'';
  el('liveTx').hidden=!session.hash;if(session.hash)el('liveTx').href=explorer+'/tx/'+session.hash;}
function mode(live){
  el('story').hidden=live;el('actions').hidden=!live;el('live').setAttribute('aria-pressed',live);el('replay').setAttribute('aria-pressed',!live);
  if(live)liveView();else replay(0);
}
el('replay').onclick=()=>mode(false);el('live').onclick=()=>mode(true);el('contract').href=explorer+'/address/'+proof.contract;
async function connect(){
  if(!window.ethereum)throw Error('请在安装了 EVM 钱包的浏览器中打开。');
  const wallet=window.ethereum,chainId='0x279f';
  if(await wallet.request({method:'eth_chainId'})!==chainId){
    try{await wallet.request({method:'wallet_switchEthereumChain',params:[{chainId}]})}
    catch(e){if(e.code!==4902)throw e;await wallet.request({method:'wallet_addEthereumChain',params:[{chainId,chainName:'Monad Testnet',nativeCurrency:{name:'MON',symbol:'MON',decimals:18},rpcUrls:['https://rpc-testnet.monadinfra.com'],blockExplorerUrls:[explorer]}]});}
  }
  await wallet.request({method:'eth_requestAccounts'});provider=new E.BrowserProvider(wallet);provider.pollingInterval=800;
  if((await provider.getNetwork()).chainId!==10143n)throw Error('请切换至 Monad 测试网');
  signer=await provider.getSigner();address=await signer.getAddress();liveView();
}
if(window.ethereum?.on)window.ethereum.on('accountsChanged',()=>{address=null;signer=null;if(!el('actions').hidden)liveView()});
const salt=k=>E.id(session.id+'/'+k);
const bid=(owner,k)=>E.keccak256(E.AbiCoder.defaultAbiCoder().encode(['address','bytes32'],[owner,salt(k)]));
async function refresh(){
  const p=provider??new E.JsonRpcProvider('https://rpc-testnet.monadinfra.com',10143);
  const reg=new E.Contract(proof.contract,abi,p);
  if((await p.getNetwork()).chainId!==10143n)throw Error('请切换至 Monad 测试网');
  const block=await p.getBlockNumber(),opt={blockTag:block};
  const values=await Promise.all(Array.from({length:16},(_,i)=>reg.occupant(session.minute,i,opt)));
  const a=session.a&&bid(session.a,'A'),alt=session.b&&bid(session.b,'alt'),direct=session.b&&bid(session.b,'direct');
  liveOwners=Object.fromEntries(values.map((v,i)=>[i,v===zero?'':v===a?'A':v===alt||v===direct?'B':'占']));
  liveView();return reg;
}
async function perform(action){
  await connect();const actor=address,reg=new E.Contract(proof.contract,abi,signer),r=proof.routes;
  if(action!=='reserve'&&(!session.a||actor===session.a))throw Error('请先由 A 完成预约，然后在扩展中切到另一账户 B。');
  if(action!=='reserve'&&session.b&&actor!==session.b)throw Error('请切回本轮运营方 B 的账户。');
  const opt={gasLimit:300000};
  let tx;
  if(action==='reserve'){
    const quote=E.parseEther(el('price').value);if(quote<0n)throw Error('报价必须大于或等于零');
    const params=[salt('A'),session.minute,r.seller,quote];
    tx=await reg.reservePath(...params,{gasLimit:(await reg.reservePath.estimateGas(...params))*125n/100n});
  }else if(action==='conflict'){
    const sellerId=bid(session.a,'A');
    if(await reg.occupant(session.minute,10)!==sellerId)throw Error('格 10 当前不属于 A，请重新读取占用。');
    try{await reg.reservePath.staticCall(salt('attempt'),session.minute,r.direct,0);throw Error('当前没有预期的冲突')}
    catch(e){const decoded=e.data&&reg.interface.parseError(e.data);if(decoded?.name!=='Occupied'||decoded.args[0]!==10n||decoded.args[1]!==sellerId)throw e;}
    tx=await reg.reservePath(salt('attempt'),session.minute,r.direct,0,opt);
  }else if(action==='reroute'){
    const params=[salt('alt'),session.minute,r.alt,0];tx=await reg.reservePath(...params,{gasLimit:(await reg.reservePath.estimateGas(...params))*125n/100n});
  }
  else{
    if(!session.b)throw Error('请先用 B 预约备选线');
    const sellerId=bid(session.a,'A'),booking=await reg.bookings(sellerId);
    if(booking.quote===0n)throw Error('A 的预约不可买断');
    const params=[sellerId,bid(actor,'alt'),salt('direct'),r.direct];
    const gas=await reg.buyoutPath.estimateGas(...params,{value:booking.quote});
    tx=await reg.buyoutPath(...params,{value:booking.quote,gasLimit:gas*125n/100n});
  }
  session.pending={hash:tx.hash,action,actor};session.hash=tx.hash;persist();liveView();
  el('feedback').textContent='等待测试网确认…';
  let receipt;try{receipt=await tx.wait()}catch(e){if(!e.receipt)throw e;receipt=e.receipt;}
  await settle(receipt);
}
async function settle(receipt){
  const pending=session.pending;if(!pending)return;
  if(!receipt)throw Error('交易仍在等待确认，请稍后读取链上占用');
  const {action,actor}=pending;
  if(receipt.status===1){if(action==='reserve')session.a=actor;else session.b=actor;}
  session.conflict=action==='conflict'&&receipt.status===0;delete session.pending;persist();
  await refresh();
  if(receipt.status===0&&!session.conflict)throw Error('交易回滚，请查看本次交易');
  el('feedback').textContent=receipt.status===1?'交易成功，网格已按链上记录更新。':'交易已回滚；可点「B · 预约备选线」继续。';
}
async function run(fn){
  if(busy)return;busy=true;const controls=[...el('actions').querySelectorAll('button')];controls.forEach(b=>b.disabled=true);
  try{el('feedback').textContent='';await fn()}catch(e){el('feedback').textContent=e.shortMessage||e.message}
  finally{controls.forEach(b=>b.disabled=false);busy=false;}
}
el('connect').onclick=()=>run(connect);
el('refresh').onclick=()=>run(async()=>{await connect();if(session.pending)await settle(await provider.getTransactionReceipt(session.pending.hash));else await refresh()});
el('reset').onclick=()=>{if(session.pending){el('feedback').textContent='请先读取交易结果';return}session=fresh();persist();liveOwners={};el('feedback').textContent='新一轮已就绪';liveView()};
el('start').onchange=()=>{const v=Date.parse(el('start').value);if(Number.isFinite(v)&&!session.a){session.minute=Math.floor(v/60000);persist();liveOwners={};liveView()}};
el('actions').querySelectorAll('[data-action]').forEach(b=>{b.onclick=()=>run(async()=>{if(session.pending)throw Error('请先读取上一笔交易结果');await perform(b.dataset.action)})});
replay(0);
