/** Self-contained webview HTML (no build step needed for v1). React via CDN is avoided — vanilla JS keeps the .vsix offline-friendly. */
export function getWebviewHtml(): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<style>
body{font-family:var(--vscode-font-family);padding:12px;color:var(--vscode-foreground)}
#log{border:1px solid var(--vscode-panel-border);border-radius:8px;padding:10px;height:60vh;overflow:auto}
.msg{margin:8px 0;white-space:pre-wrap}
.user{color:var(--vscode-textLink-foreground)}
.row{display:flex;gap:8px;margin-top:10px}
input{flex:1;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:6px;padding:8px}
button{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:0;border-radius:6px;padding:8px 14px;cursor:pointer}
.badge{font-size:11px;border:1px solid var(--vscode-panel-border);border-radius:10px;padding:1px 8px;margin-left:6px}
</style></head>
<body>
<h3>HASA — coding agent <span class="badge">BYOK · free models</span></h3>
<div id="log"></div>
<div class="row"><input id="in" placeholder="Ask HASA… (Enter to send)" /><button id="send">Send</button></div>
<div class="row"><button id="models">List free models</button></div>
<script>
const vscode = acquireVsCodeApi();
const log = document.getElementById('log');
const input = document.getElementById('in');
function add(cls, text){ const d=document.createElement('div'); d.className='msg '+cls; d.textContent=text; log.appendChild(d); log.scrollTop=log.scrollHeight; }
document.getElementById('send').onclick = () => { const t=input.value.trim(); if(!t) return; add('user','› '+t); vscode.postMessage({type:'send',text:t}); input.value=''; };
input.addEventListener('keydown', e => { if(e.key==='Enter') document.getElementById('send').click(); });
document.getElementById('models').onclick = () => vscode.postMessage({type:'models'});
window.addEventListener('message', e => {
  const m = e.data;
  if(m.type==='assistant'||m.type==='assistantDelta') add('assistant','✦ '+(m.text||''));
  if(m.type==='models') add('assistant','Models:\\n'+(m.models||[]).map(x=> '• ['+x.provider+'] '+x.id+(x.isFree?' [Free]':'')).join('\\n'));
});
</script>
</body></html>`;
}
