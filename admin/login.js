const form=document.querySelector('#loginForm'),error=document.querySelector('#loginError'),password=document.querySelector('#loginPassword');
const apiBase=String(window.AVIASAFE_API_BASE||'').replace(/\/$/,'');
const apiUrl=path=>apiBase+path;
fetch(apiUrl('/api/auth/me'),{credentials:'include'}).then(r=>{if(r.ok)location.replace('/admin/')}).catch(()=>{});
document.querySelector('#showPassword').onclick=()=>{password.type=password.type==='password'?'text':'password';document.querySelector('#showPassword').textContent=password.type==='password'?'Show':'Hide'};
function notice(message){const t=document.querySelector('#loginToast');t.textContent=message;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600)}
form.onsubmit=async e=>{e.preventDefault();error.textContent='';const button=form.querySelector('button[type=submit]');button.disabled=true;button.textContent='Signing in…';try{const r=await fetch(apiUrl('/api/auth/login'),{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.querySelector('#loginEmail').value,password:password.value,remember:document.querySelector('#rememberMe').checked})}),v=await r.json();if(!r.ok)throw new Error(v.error);location.replace('/admin/')}catch(e){error.textContent=e.message||'Unable to connect to the admin API.';button.disabled=false;button.textContent='Sign in to dashboard →'}};
document.querySelector('#forgotPassword').onclick=()=>notice('Password reset ke liye administrator se contact karein.');
document.querySelector('#googleLogin').onclick=()=>notice('Google OAuth credentials abhi configure nahi hain.');
