const $=s=>document.querySelector(s),colors=['yellow','blue','red','green','purple'];
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const storage={get(k){try{return localStorage.getItem(k)}catch{return null}},set(k,v){try{localStorage.setItem(k,v)}catch{}}};
let photoData='',photoProcessing=false,photoVersion=0;
let board,code,source,sort='new',timer,busy=false,adminStatus;
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(timer);timer=setTimeout(()=>$('#toast').hidden=true,3000)}
function modal(html){$('#dialog-content').innerHTML=html;if(!$('#dialog').open)$('#dialog').showModal()}
$('.dialog-close').onclick=()=>$('#dialog').close();
async function request(path,method='GET',data){const r=await fetch('/api'+path,{method,headers:{'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});let d;try{d=await r.json()}catch{throw Error('서버 연결을 확인하세요.')}if(!r.ok)throw Error(d.error||'처리하지 못했습니다.');return d}
const api=(p,m,d)=>request('/rooms'+p,m,d);
function createDialog(){
modal('<h2 id="dialog-title">보드 만들기</h2><form id="create-form"><label for="new-topic">제목</label><input id="new-topic" maxlength="80" required><p class="error" id="create-error" role="alert"></p><button class="btn blue full" id="create-submit">만들기</button></form>');
$('#create-form').onsubmit=async e=>{e.preventDefault();const b=$('#create-submit');b.disabled=true;try{const d=await api('','POST',{topic:$('#new-topic').value});location.href='/?room='+d.code}catch(e){$('#create-error').textContent=e.message;b.disabled=false}};
}
$('#create').onclick=createDialog;
$('#join-form').onsubmit=async e=>{e.preventDefault();$('#join-error').textContent='';const value=$('#code').value;if(!/^\d{6}$/.test(value)){$('#join-error').textContent='숫자 6자리를 입력하세요.';return}const b=e.submitter;b.disabled=true;try{await api('/'+value);location.href='/?room='+value}catch(e){$('#join-error').textContent=e.message;b.disabled=false}};
$('#code').onpaste=e=>{const text=e.clipboardData.getData('text').trim();const digits=text.replace(/[\s-]/g,'');if(/^\d{6}$/.test(digits)){e.preventDefault();e.target.value=digits;paintCode();$('#join-error').textContent=''}};
$('#code').oninput=e=>{e.target.value=e.target.value.replace(/\D/g,'');paintCode();$('#join-error').textContent=''};
$('#logout').onclick=async()=>{try{await request('/admin/logout','POST');location.href='/'}catch(e){toast(e.message)}};
async function adminPage(){
$('#home').hidden=true;$('#admin').hidden=false;
if(adminStatus.authenticated){$('#admin-auth').hidden=true;$('#admin-dashboard').hidden=false;await listBoards();return}
const setup=adminStatus.needsSetup;
$('#auth-title').textContent=setup?'관리자 최초 설정':'관리자 로그인';
$('#auth-note').textContent=setup?(adminStatus.setupAllowed?'비밀번호 설정 후 관리자만 보드를 만들 수 있습니다.':'서버 PC에서 localhost:4317에 접속해 관리자 비밀번호를 설정하세요.'):'';
$('#auth-note').hidden=!setup;
$('#login-form').hidden=setup&&!adminStatus.setupAllowed;
$('#confirm-wrap').hidden=!setup;$('#password-confirm').required=setup;
$('#password').minLength=4;$('#password').autocomplete=setup?'new-password':'current-password';
$('#password').placeholder='숫자 4자리';
$('#login-submit').textContent=setup?'비밀번호 설정':'로그인';
$('#login-form').onsubmit=async e=>{e.preventDefault();$('#auth-error').textContent='';if(setup&&$('#password').value!==$('#password-confirm').value){$('#auth-error').textContent='비밀번호 확인이 일치하지 않습니다.';return}const b=$('#login-submit');b.disabled=true;try{await request(setup?'/admin/setup':'/admin/login','POST',{password:$('#password').value});location.href='/?admin=1'}catch(e){$('#auth-error').textContent=e.message;b.disabled=false}};
}
async function listBoards(){
const rows=await request('/admin/rooms');
$('#admin-boards').innerHTML=rows.length?rows.map(r=>'<article class="admin-row"><a href="/?room='+r.code+'"><h2>'+esc(r.topic)+'</h2><span>코드 '+r.code+' · 글 '+r.count+'개 · '+(r.closed?'마감':'진행 중')+'</span></a><div><a class="outline" href="/?room='+r.code+'">관리</a><button data-remove-board="'+r.code+'" class="danger">삭제</button></div></article>').join(''):'<div class="empty">등록된 보드가 없습니다.</div>';
}
$('#admin-boards').onclick=e=>{const b=e.target.closest('[data-remove-board]');if(!b)return;modal('<h2 id="dialog-title">보드 삭제</h2><p>보드와 모든 글이 삭제됩니다.</p><button class="btn red full" id="confirm-remove-board">삭제</button>');$('#confirm-remove-board').onclick=async()=>{try{await api('/'+b.dataset.removeBoard,'DELETE');$('#dialog').close();await listBoards()}catch(e){toast(e.message)}}};
function render(){
$('#topic').textContent=board.topic;document.title=board.topic+' | 레고학교 담벼락';
$('#room-code').textContent=code;$('#total').textContent=board.posts.length;
$('#post-form').hidden=board.closed;$('#closed-note').hidden=!board.closed;$('#close-room').textContent=board.closed?'작성 재개':'작성 마감';$('#host-tools').hidden=!board.isAdmin;
$('#pick').disabled=!board.posts.length;$('#empty').hidden=board.posts.length>0;
const posts=[...board.posts].sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned)||(sort==='top'?b.likes-a.likes:0)||b.created-a.created);
$('#feed').innerHTML=posts.map(p=>'<article class="note '+colors[p.color]+'" data-id="'+esc(p.id)+'">'+(p.pinned?'<span class="pinned-label">고정</span>':'')+(p.text?'<p class="note-text">'+esc(p.text)+'</p>':'')+attachmentHtml(p)+'<footer class="note-footer"><span>'+esc(p.nick)+(p.mine?' · 나':'')+'</span><div class="note-actions">'+(board.isAdmin?'<button class="pin-post" data-pin="'+esc(p.id)+'" aria-pressed="'+!!p.pinned+'">'+(p.pinned?'고정 해제':'고정')+'</button>':'')+(p.mine||board.isAdmin?'<button class="delete" data-delete="'+esc(p.id)+'" aria-label="글 삭제">×</button>':'')+'<button class="heart" data-like="'+esc(p.id)+'" aria-label="공감 '+p.likes+'개" aria-pressed="'+p.liked+'">'+(p.liked?'♥':'♡')+' '+p.likes+'</button></div></footer></article>').join('');
}
async function enter(){
try{
adminStatus=await request('/admin/status');$('#logout').hidden=!adminStatus.authenticated;$('#admin-link').textContent=adminStatus.authenticated?'보드 관리':'관리자';
const p=new URLSearchParams(location.search);if(p.has('admin'))return await adminPage();code=p.get('room');if(!code)return;
if(!/^\d{6}$/.test(code))return missing('참여 코드는 숫자 6자리입니다.');
$('#home').hidden=true;$('#room').hidden=false;$('#nick').value=storage.get('brick-nick')||'';
board=await api('/'+code);render();pinQr();
if(board.pollInterval){let last=JSON.stringify(board);setInterval(async()=>{if(document.hidden)return;try{const next=await api('/'+code);$('#connection').textContent='연결됨';if(JSON.stringify(next)!==last){board=next;last=JSON.stringify(next);render()}}catch(e){$('#connection').textContent=e.message}},board.pollInterval);return}
source=new EventSource('/api/rooms/'+code+'/events');
source.onmessage=e=>{board=JSON.parse(e.data);$('#connection').textContent='연결됨';render()};
source.onerror=()=>$('#connection').textContent='재연결 중';
source.addEventListener('deleted',()=>{source.close();$('#dialog').close();missing('삭제된 보드입니다.')});
}catch(e){if(new URLSearchParams(location.search).has('admin')){toast(e.message);$('#auth-error').textContent=e.message}else missing(e.message)}
}
function missing(msg){$('#room').hidden=true;$('#home').hidden=false;$('#join-error').textContent=msg;$('#code').focus()}
$('#message').oninput=e=>$('#count').textContent=e.target.value.length+' / 140';
$('#message').onkeydown=e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey))$('#post-form').requestSubmit()};
$('#post-form').onsubmit=async e=>{e.preventDefault();if(busy||photoProcessing)return;const text=$('#message').value.trim();if(!text&&!photoData&&!$('#attachment-link').value.trim())return toast('내용이나 첨부를 추가하세요.');busy=true;$('#send').disabled=true;
const data={text,image:photoData,link:$('#attachment-link').value.trim(),nick:$('#nick').value.trim(),color:Number(new FormData(e.target).get('color'))};
try{await api('/'+code+'/posts','POST',data);storage.set('brick-nick',data.nick);$('#message').value='';clearPhoto();$('#remove-link').click();$('#count').textContent='0 / 140';toast('등록되었습니다.')}catch(e){toast(e.message)}finally{busy=false;$('#send').disabled=false}};
$('#feed').onclick=async e=>{const like=e.target.closest('[data-like]'),del=e.target.closest('[data-delete]'),pin=e.target.closest('[data-pin]'),photo=e.target.closest('[data-photo]');
if(photo){const p=board.posts.find(p=>p.id===photo.dataset.photo);if(p?.image)modal('<h2 id="dialog-title">사진</h2><img class="photo-full" src="'+esc(p.image)+'" alt="첨부 사진">')}
if(pin){pin.disabled=true;try{await api('/'+code+'/pin','PATCH',{id:pin.dataset.pin,pinned:pin.getAttribute('aria-pressed')!=='true'})}catch(e){toast(e.message)}finally{pin.disabled=false}}
if(like){like.disabled=true;try{await api('/'+code+'/like','POST',{id:like.dataset.like})}catch(e){toast(e.message)}finally{like.disabled=false}}
if(del){modal('<h2 id="dialog-title">글 삭제</h2><p>삭제한 글은 복구할 수 없습니다.</p><button class="btn red full" id="confirm-delete">삭제</button>');$('#confirm-delete').onclick=async()=>{try{await api('/'+code+'/posts','DELETE',{id:del.dataset.delete});$('#dialog').close()}catch(e){toast(e.message)}}}
};
document.querySelectorAll('[data-sort]').forEach(b=>b.onclick=()=>{sort=b.dataset.sort;document.querySelectorAll('[data-sort]').forEach(x=>x.setAttribute('aria-pressed',x===b));render()});
$('#close-room').onclick=async()=>{try{await api('/'+code+'/manage','PATCH',{closed:!board.closed})}catch(e){toast(e.message)}};
$('#edit-topic').onclick=()=>{modal('<h2 id="dialog-title">제목 수정</h2><form id="edit-form"><label for="edit-value">제목</label><input id="edit-value" maxlength="80" required value="'+esc(board.topic)+'"><button class="btn blue full">저장</button></form>');$('#edit-form').onsubmit=async e=>{e.preventDefault();try{await api('/'+code+'/manage','PATCH',{topic:$('#edit-value').value});$('#dialog').close()}catch(e){toast(e.message)}}};
$('#pick').onclick=()=>{if(!board.posts.length)return;const values=new Uint32Array(1);crypto.getRandomValues(values);const p=board.posts[values[0]%board.posts.length];modal('<h2 id="dialog-title">'+esc(p.nick)+'</h2><p class="spot-text">'+esc(p.text)+'</p><button class="btn blue full" id="pick-again">다시 뽑기</button>');$('#pick-again').onclick=()=>$('#pick').click()};
async function copyText(value,message){
try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(value);toast(message);return}}catch{}
const input=document.createElement('textarea');input.value=value;input.className='copy-buffer';input.setAttribute('readonly','');const previous=document.activeElement;($('#dialog').open?$('#dialog'):document.body).append(input);input.select();input.setSelectionRange(0,value.length);
let copied=false;try{copied=document.execCommand('copy')}catch{}input.remove();previous?.focus();
if(copied){toast(message);return}
modal('<h2 id="dialog-title">복사</h2><input id="manual-copy" readonly aria-label="복사할 내용" value="'+esc(value)+'"><p class="copy-help">길게 누르거나 Ctrl+C로 복사하세요.</p>');$('#manual-copy').select();
}
$('#copy-code').onclick=()=>copyText(code,'코드 '+code+' 복사됨');
async function shareOrigins(){if(!['localhost','127.0.0.1','[::1]'].includes(location.hostname))return [location.origin];return (await request('/share-addresses')).origins}
async function pinQr(){try{const origins=await shareOrigins();if(!origins.length)return;const qr=qrcode(0,'M');qr.addData(origins[0]+'/?room='+code);qr.make();$('#share').innerHTML='<img class="pinned-qr" src="'+qr.createDataURL(5,20)+'" alt="참여 QR 코드"><span>QR 확대</span>'}catch{}}
$('#share').onclick=async()=>{
const button=$('#share');button.disabled=true;
try{
let origins=[location.origin],localOnly=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
if(localOnly){const d=await request('/share-addresses');origins=d.origins;if(!origins.length){modal('<h2 id="dialog-title">보드 공유</h2><p>네트워크 연결 후 다시 시도하세요.</p>');return}}
modal('<h2 id="dialog-title">보드 공유</h2>'+(origins.length>1?'<label for="share-origin">접속 주소</label><select id="share-origin">'+origins.map(o=>'<option value="'+esc(o)+'">'+esc(o)+'</option>').join('')+'</select>':'')+'<a id="qr-link" class="qr-preview" target="_blank" rel="noopener" aria-label="QR 참여 링크 열기"></a><button class="share-code" id="dialog-code" title="참여 코드 복사">'+code+'</button>'+(localOnly?'<p class="network-note">같은 네트워크에서 접속</p>':'')+'<label for="join-link">참여 링크</label><input id="join-link" readonly><button class="btn blue full" id="copy-link">링크 복사</button>');
function draw(origin){const link=origin+'/?room='+code;const qr=qrcode(0,'M');qr.addData(link);qr.make();$('#qr-link').href=link;$('#qr-link').innerHTML='<img src="'+qr.createDataURL(8,32)+'" alt="보드 '+code+' 참여 QR 코드" width="256" height="256">';$('#join-link').value=link}
draw(origins[0]);if($('#share-origin'))$('#share-origin').onchange=e=>draw(e.target.value);
$('#dialog-code').onclick=()=>copyText(code,'코드 '+code+' 복사됨');
$('#copy-link').onclick=()=>copyText($('#join-link').value,'참여 링크 복사됨');
$('#join-link').onclick=e=>e.target.select();
}catch(e){toast(e.message)}finally{button.disabled=false}
};
$('#export').onclick=()=>{const lines=['레고학교 담벼락',board.topic,'코드: '+code,'저장: '+new Date().toLocaleString('ko-KR'),'','글 '+board.posts.length+'개','',...board.posts.map((p,i)=>(i+1)+'. '+(p.pinned?'[고정] ':'')+p.text+(p.link?'\n   '+p.link:'')+(p.image?'\n   사진: '+location.origin+p.image:'')+'\n   '+p.nick+' · 공감 '+p.likes)];
const url=URL.createObjectURL(new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='레고학교_담벼락_'+code+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)};
$('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{toast('전체 화면을 지원하지 않습니다.')}};
document.addEventListener('fullscreenchange',()=>{document.body.classList.toggle('present',!!document.fullscreenElement);$('#fullscreen').textContent=document.fullscreenElement?'전체 화면 종료':'전체 화면'});
window.addEventListener('beforeunload',()=>source?.close());enter();

function paintCode(){document.querySelectorAll('.code-cells span').forEach((cell,i)=>{cell.textContent=$('#code').value[i]||'';cell.classList.toggle('current',i===Math.min($('#code').value.length,5))})}
$('#code').addEventListener('focus',paintCode);paintCode();

function attachmentHtml(p){
let html=p.image?'<button class="post-photo" data-photo="'+esc(p.id)+'" aria-label="사진 확대"><img src="'+esc(p.image)+'" alt="첨부 사진" loading="lazy"></button>':'';
if(p.link){try{const url=new URL(p.link);if(['http:','https:'].includes(url.protocol)){const label=url.hostname==='padlet.com'||url.hostname.endsWith('.padlet.com')?'패들렛 열기 ↗':url.hostname+' ↗';html+='<a class="post-link" href="'+esc(url.href)+'" target="_blank" rel="noopener noreferrer"><b>'+esc(label)+'</b><span>'+esc(url.href)+'</span></a>'}}catch{}}return html;
}
function clearPhoto(){photoVersion++;photoProcessing=false;$('#send').disabled=busy;photoData='';$('#photo').value='';$('#photo-preview').hidden=true;$('#photo-thumb').removeAttribute('src');$('#attachment-error').textContent=''}
$('#remove-photo').onclick=clearPhoto;
$('#choose-photo').onclick=()=>$('#photo').click();
$('#add-link').onclick=()=>{$('#link-wrap').hidden=false;$('#add-link').setAttribute('aria-expanded','true');$('#attachment-link').focus()};
$('#remove-link').onclick=()=>{$('#attachment-link').value='';$('#link-wrap').hidden=true;$('#add-link').setAttribute('aria-expanded','false')};
$('#photo').onchange=async e=>{
const file=e.target.files[0];if(!file)return;clearPhoto();const version=photoVersion;photoProcessing=true;$('#send').disabled=true;
try{if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>15*1024*1024)throw Error('JPG·PNG·WebP 사진을 15MB 이하로 선택하세요.');
const bitmap=await createImageBitmap(file);try{let size=Math.min(1,1400/Math.max(bitmap.width,bitmap.height));let data='';const canvas=document.createElement('canvas');
for(let i=0;i<7;i++){canvas.width=Math.max(1,Math.round(bitmap.width*size));canvas.height=Math.max(1,Math.round(bitmap.height*size));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);data=canvas.toDataURL('image/jpeg',.78);if(data.length<=380000)break;size*=.75}
if(data.length>380000)throw Error('더 작은 사진을 선택하세요.');if(version!==photoVersion)return;photoData=data;$('#photo-thumb').src=data;$('#photo-preview').hidden=false;
}finally{bitmap.close()}
}catch(e){if(version===photoVersion)$('#attachment-error').textContent=e.message||'사진을 열 수 없습니다.'}finally{if(version===photoVersion){photoProcessing=false;$('#send').disabled=false}}
};
