'use strict';
const {proof,abi}=window.MarketData;
const E=window.ethers, Z=E.ZeroHash, $=id=>document.getElementById(id);
const explorer='https://testnet.monadscan.com', rpc='https://rpc-testnet.monadinfra.com';
const labels={A:'巡检',B:'加急配送',C:'常规物流',D:'固定任务'};
const palette={A:'#bdf697',B:'#86ccff',C:'#e2baff',D:'#ffc27a'};
const events={
  reserveA:['巡检挂牌','A 在格 9、10 挂牌，整条预约报价 0.003 测试 MON。'],
  reserveC:['常规物流挂牌','C 占格 14、15，整条预约报价 0.007 测试 MON。'],
  reserveD:['固定任务占格','D 占格 7、11，选择不可买断。'],
  conflictB:['加急配送撞格','B 申请 6、10、14、15。格 10 被占，先申请的格 6 也已回滚。'],
  altB:['买方改订备选线','B 改订 0、4、8、12，四家运营商各自持有预约。'],
  blockedD:['第三方阻止买断','新路线还经过 D 的格 11。整单失败，A、C 均未收款，B 仍保有备选线。'],
  multiBuy:['两家让路，同笔收款','B 绕开 D，买断 A 与 C。C 的两个格子来自同一预约，只收一次。B 释放备选线，D 保留原线。']
};
const short=s=>s.slice(0,6)+'…'+s.slice(-4);
const minuteText=m=>new Date(m*60000).toLocaleString('zh-CN',{hour12:false,timeZoneName:'short'});
const keyOf=addr=>Object.keys(proof.operators).find(k=>proof.operators[k].toLowerCase()===addr.toLowerCase());
function identity(addr){
  const k=keyOf(addr);
  if(k)return {label:k+' '+labels[k],mark:k,color:palette[k]};
  return {label:short(addr),mark:addr.slice(-3),color:'hsl('+parseInt(addr.slice(-4),16)%360+' 68% 78%)'};
}
let mode='demo', current=0, provider, account='',busy=false,revision=0,review=null,pending=null;
let view={owners:{},selected:[],conflicts:[],minute:proof.minute};
function render(){
  const level=$('level').selectedIndex, frag=document.createDocumentFragment(), unique=new Set();
  for(let y=3;y>=0;y--)for(let x=0;x<4;x++){
    const cell=16*level+4*y+x,addr=view.owners[cell],tile=document.createElement('div');
    tile.className='cell'+(view.conflicts.includes(cell)?' collision':view.selected.includes(cell)?' chosen':'');
    tile.textContent='·';
    if(addr){const item=identity(addr);tile.style.background=item.color;tile.style.color='#172c2b';tile.textContent=item.mark;unique.add(addr);}
    tile.title='格 '+cell+' · '+(addr||'空闲');const n=document.createElement('small');n.textContent=cell;tile.append(n);frag.append(tile);
  }
  $('map').replaceChildren(frag);$('legend').replaceChildren();
  for(const addr of unique){const i=identity(addr),s=document.createElement('span'),b=document.createElement('b');b.className='key';b.style.background=i.color;s.append(b,i.label);s.title=addr;$('legend').append(s);}
  $('slice').textContent=minuteText(view.minute)+(view.block?' · 区块 '+view.block:'');
}
function replay(i){
  current=i;const step=proof.steps[i],owners={};
  for(const [cell,id] of Object.entries(step.occupied)){
    const role=Object.keys(proof.bookings).find(k=>proof.bookings[k]===id);
    owners[cell]=proof.operators[role]||proof.operators.B;
  }
  const denied=step.label==='blockedD',initial=step.label==='conflictB';
  view={owners,selected:denied?proof.routes.blocked:initial||step.label==='multiBuy'?proof.routes.direct:[],conflicts:denied?[11]:initial?[10]:[],minute:proof.minute,block:step.block};
  $('result').textContent=events[step.label][0];$('reason').textContent=events[step.label][1]+(step.payouts?' 实收：A '+step.payouts.A+'、C '+step.payouts.C+' 测试 MON。':'');
  if(step.networkFee)$('reason').textContent+=' 买方另付网络费 '+step.networkFee.feeMON+' 测试 MON。';
  $('receipt').href=explorer+'/tx/'+step.tx;[...$('timeline').children].forEach((b,j)=>b.setAttribute('aria-pressed',String(i===j)));render();
}
proof.steps.forEach((s,i)=>{const b=document.createElement('button'),n=document.createElement('i');b.className='row';n.textContent=String(i+1).padStart(2,'0');b.append(n,events[s.label][0]);b.onclick=()=>replay(i);$('timeline').append(b)});
function invalidate(){revision++;review=null;$('submit').disabled=true;$('intent').textContent='请重新核对报价';$('quotes').replaceChildren();}
function change(live){mode=live?'live':'demo';invalidate();$('history').hidden=live;$('trading').hidden=!live;
  $('demoTab').setAttribute('aria-pressed',!live);$('tradeTab').setAttribute('aria-pressed',live);
  if(live){view={owners:{},selected:[],conflicts:[],minute:Math.floor(Date.parse($('start').value)/60000)};render()}else replay(current);}
function inputs(){
  const minute=Math.floor(Date.parse($('start').value)/60000),parts=$('route').value.trim().split(/[,，\s]+/);
  if(!minute||parts.length>16||parts.some(p=>!/^\d{1,2}$/.test(p)||Number(p)>=64))throw Error('请选时间，填写 1 至 16 个格号（0–63）。');
  const cells=parts.map(Number);if(new Set(cells).size!==cells.length)throw Error('同一条路线中格号不能重复');
  return {minute,cells};
}
async function connect(){
  const w=window.ethereum;if(!w)throw Error('请在有 EVM 钱包的浏览器中打开。');
  if(BigInt(await w.request({method:'eth_chainId'}))!==10143n){
    try{await w.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x279f'}]})}
    catch(e){if(e.code!==4902)throw e;await w.request({method:'wallet_addEthereumChain',params:[{chainId:'0x279f',chainName:'Monad Testnet',nativeCurrency:{name:'MON',symbol:'MON',decimals:18},rpcUrls:[rpc],blockExplorerUrls:[explorer]}]})}
  }
  await w.request({method:'eth_requestAccounts'});provider=new E.BrowserProvider(w);provider.pollingInterval=800;
  if((await provider.getNetwork()).chainId!==10143n)throw Error('请切到 Monad 测试网');
  account=await (await provider.getSigner()).getAddress();$('account').textContent=short(account);
}
function line(text){const li=document.createElement('li');li.textContent=text;$('quotes').append(li);}
async function preview(){
  invalidate();const version=revision, input=inputs(),p=provider||new E.JsonRpcProvider(rpc,10143);
  const reg=new E.Contract(proof.contract,abi,p),block=await p.getBlock('latest');
  const [ids,addresses,prices,departed]=await reg.board(input.minute,{blockTag:block.number});
  if(version!==revision||mode!=='live')return;
  const owners={},mine=new Map(),wanted=new Map();
  ids.forEach((id,i)=>{if(id!==Z){owners[i]=addresses[i];if(account&&addresses[i].toLowerCase()===account.toLowerCase())mine.set(id, i)}});
  const chosen=$('alt').value;$('alt').replaceChildren(new Option('保留全部',''));
  for(const [id,i] of mine)$('alt').add(new Option('我的预约 '+short(id)+' · 含格 '+i,id));
  if(mine.has(chosen))$('alt').value=chosen;
  const alt=$('alt').value||Z;
  for(const cell of input.cells){const id=ids[cell];if(id!==Z&&id!==alt&&!wanted.has(id))wanted.set(id,cell)}
  const errors=[],blocked=[],expected=[...wanted.keys()];let total=0n;
  if(input.minute*60<=block.timestamp+90)errors.push('该时段已进入锁定窗口');
  if(alt!==Z&&departed[mine.get(alt)])errors.push('选择释放的旧预约已起飞');
  for(const [id,i] of wanted){
    const own=account&&addresses[i].toLowerCase()===account.toLowerCase();
    const reason=own?'本人的旧预约，请选择随成交释放':departed[i]?'已起飞':prices[i]===0n?'不可买断':'';
    const hits=input.cells.filter(n=>ids[n]===id);line(identity(addresses[i]).label+' · 格 '+hits.join('、')+' · '+(reason||E.formatEther(prices[i])+' 测试 MON'));
    if(reason){errors.push(reason);blocked.push(...hits)}total+=prices[i];
  }
  if(!expected.length&&alt!==Z)errors.push('直接预约请选“保留全部”；释放已有预约可用下方管理操作。');
  const direct=!expected.length;$('price').disabled=!direct;
  const quote=direct?E.parseEther($('price').value):0n;
  if(quote<0n||quote>=2n**128n)throw Error('报价超出范围');
  view={owners,selected:input.cells,conflicts:blocked,minute:input.minute,block:block.number};render();
  $('intent').textContent=errors.length?'暂不可成交':direct?'整线空闲':expected.length+' 份预约 · 总补偿 '+E.formatEther(total)+' 测试 MON';
  $('notice').textContent=errors.join('。')||(!account?'连接钱包后重新读取报价。':direct?'所有格将同时生效。':'成交将释放卖方整份预约，新预约默认不可买断。');
  $('submit').textContent=direct?'预约整线':'确认买断';
  if(!errors.length&&account){review={...input,expected,total,quote,alt,account};$('submit').disabled=false;}
}
async function broadcast(make){
  const tx=await make();pending=tx.hash;try{localStorage.setItem('voxel-market-pending',pending)}catch{}
  $('lastTx').href=explorer+'/tx/'+pending;$('lastTx').hidden=false;$('notice').textContent='交易已发送，等待确认。';
  try{await tx.wait()}catch(e){if(!e.receipt)throw e;throw Error('交易已回滚，请重新读取占用。')}
  finally{if(await provider.getTransactionReceipt(tx.hash)){pending=null;try{localStorage.removeItem('voxel-market-pending')}catch{}}}
  await preview();$('notice').textContent='交易成功，已重新读取链上占用。';
}
async function write(action){
  if(!provider||!account)throw Error('请先连接钱包');
  if(pending){const r=await provider.getTransactionReceipt(pending);if(!r)throw Error('上一笔交易尚待确认');pending=null;localStorage.removeItem('voxel-market-pending');await preview();throw Error('上一笔已确认，请核对更新后的报价。')}
  const signer=await provider.getSigner();
  if((await provider.getNetwork()).chainId!==10143n||await signer.getAddress()!==account)throw Error('钱包账户或网络已变更，请重新连接');
  const reg=new E.Contract(proof.contract,abi,signer);
  if(action!=='submit'){
    const id=$('alt').value;if(!id)throw Error('请先在旧预约列表中选择一项');
    const label=action==='release'?'释放整份预约':'将预约标记为已起飞';if(!window.confirm(label+' '+short(id)+'？'))return;
    invalidate();return broadcast(()=>reg[action](id));
  }
  const r=review;if(!r||r.account!==account)throw Error('请先读取本轮报价');
  invalidate();const salt=E.hexlify(E.randomBytes(32));
  const method=r.expected.length?reg.buyoutMany:reg.reservePath;
  const values=r.expected.length?[r.minute,r.cells,r.expected,r.alt,salt]:[salt,r.minute,r.cells,r.quote];
  const opts=r.expected.length?{value:r.total}:{};
  const gas=await method.estimateGas(...values,opts);await broadcast(()=>method(...values,{...opts,gasLimit:gas*125n/100n}));
}
async function run(fn){if(busy)return;busy=true;try{await fn()}catch(e){invalidate();$('notice').textContent=e.shortMessage||e.message}finally{busy=false}}
const start=new Date(Date.now()+20*60000);$('start').value=new Date(start-start.getTimezoneOffset()*60000).toISOString().slice(0,16);
try{pending=localStorage.getItem('voxel-market-pending');if(pending){$('lastTx').hidden=false;$('lastTx').href=explorer+'/tx/'+pending}}catch{}
$('demoTab').onclick=()=>change(false);$('tradeTab').onclick=()=>change(true);$('level').onchange=render;
for(const id of ['start','price','route','alt'])$(id).oninput=invalidate;
$('connect').onclick=()=>run(async()=>{await connect();await preview()});$('preview').onclick=()=>run(preview);
for(const id of ['submit','release','markDeparted'])$(id).onclick=()=>run(()=>write(id));
for(const event of ['accountsChanged','chainChanged'])window.ethereum?.on?.(event,()=>{account='';provider=null;$('account').textContent='';invalidate()});
$('contract').href=explorer+'/address/'+proof.contract;replay(0);
