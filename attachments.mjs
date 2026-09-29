const bad=message=>{throw Object.assign(new Error(message),{status:400})};
export function attachment(b){
let link='';if(b.link){if(typeof b.link!=='string'||b.link.length>2048)bad('링크를 확인하세요.');try{const u=new URL(b.link);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)bad('http 또는 https 링크를 입력하세요.');link=u.href}catch{bad('http 또는 https 링크를 입력하세요.')}}
let image='';if(b.image){if(typeof b.image!=='string'||b.image.length>400000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(b.image))bad('사진을 다시 선택하세요.');const bytes=Buffer.from(b.image.split(',')[1],'base64');if(bytes.length>300000||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255||bytes.at(-2)!==255||bytes.at(-1)!==217)bad('사진을 다시 선택하세요.');image=b.image}
const text=typeof b.text==='string'?b.text.trim():'';if(text.length>140)bad('내용은 140자까지 입력하세요.');if(!text&&!link&&!image)bad('내용이나 첨부를 추가하세요.');return {text,link,image};
}
