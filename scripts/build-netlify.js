const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const output=path.join(root,'netlify-dist');
const apiBase=String(process.env.PUBLIC_API_BASE||'').replace(/\/$/,'');
if(!/^https:\/\/[^/]+/.test(apiBase))throw new Error('PUBLIC_API_BASE must be the HTTPS Railway API URL');
fs.rmSync(output,{recursive:true,force:true});
fs.mkdirSync(output,{recursive:true});
for(const name of ['index.html','sms.html','capability-search.js','content-manager.js','admin','assets','img','logos','vite.svg','_redirects']){
  const source=path.join(root,name);
  if(fs.existsSync(source))fs.cpSync(source,path.join(output,name),{recursive:true});
}
fs.writeFileSync(path.join(output,'api-config.js'),`window.AVIASAFE_API_BASE=${JSON.stringify(apiBase)};\n`);
console.log(`Netlify package created for API ${apiBase}`);
