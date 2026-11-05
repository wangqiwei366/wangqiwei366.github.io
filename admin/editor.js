/* Local, pinned Quill + DOMPurify + marked. Article HTML is sanitized on every
 * import/export; untouched legacy Markdown is retained byte-for-byte. */
(() => {
  const BASE_SIZE = 18;
  const TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' };
  const STYLES = new Set(['font-size', 'font-family', 'font-weight', 'font-style', 'text-decoration', 'text-align', 'color', 'background-color', 'white-space']);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeURL = value => {
    const text = String(value || '').trim();
    return /^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(text) || /^(?:img|media)\//.test(text) ? text : '';
  };
  function sanitize(html) {
    const clean = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['p','div','span','br','strong','b','em','i','u','s','del','sub','sup','h1','h2','h3','h4','h5','h6','blockquote','ul','ol','li','pre','code','a','img','video','source','figure','figcaption','hr','table','thead','tbody','tr','td','th'],
      ALLOWED_ATTR: ['style','href','src','alt','title','poster','controls','preload','playsinline','type','colspan','rowspan','start'],
      ALLOW_DATA_ATTR: false,
    });
    const doc = new DOMParser().parseFromString(clean, 'text/html');
    doc.body.querySelectorAll('*').forEach(node => {
      [...node.style].forEach(name => { if (!STYLES.has(name) || /url\s*\(|expression|var\s*\(/i.test(node.style.getPropertyValue(name))) node.style.removeProperty(name); });
      ['href','src','poster'].forEach(attr => {
        if (node.hasAttribute(attr)) {
          const url = safeURL(node.getAttribute(attr));
          if (url) node.setAttribute(attr, url); else node.removeAttribute(attr);
        }
      });
      if (node.tagName === 'A') { node.setAttribute('rel', 'noopener noreferrer'); }
      if (node.tagName === 'VIDEO') { node.setAttribute('controls',''); node.setAttribute('playsinline',''); node.setAttribute('preload','metadata'); }
      if (!node.getAttribute('style')) node.removeAttribute('style');
    });
    return doc.body.innerHTML;
  }
  function render(source) {
    const legacy = String(source || '').replace(/\[font\s+([^\]]+)\]([\s\S]*?)\[\/font\]/g, (_, attrs, text) => {
      const size = attrs.match(/size=(\d+)/), weight = attrs.match(/weight=(\d+)/);
      return `<span style="${size ? `font-size:${Math.max(8,Math.min(72,+size[1]))}px;` : ''}${weight ? `font-weight:${Math.max(100,Math.min(900,+weight[1]))}` : ''}">${text}</span>`;
    });
    return sanitize(marked.parse(legacy, { breaks: false, gfm: true }));
  }
  function fontPixels(value, inherited = 16) {
    const m = String(value).trim().match(/^([\d.]+)(px|pt|em|rem|%)$/i);
    if (!m) return inherited;
    const n = Number(m[1]);
    return m[2] === 'pt' ? n * 4/3 : m[2] === 'em' ? n * inherited : m[2] === 'rem' ? n * 16 : m[2] === '%' ? n * inherited / 100 : n;
  }
  // Preserve the copied text's size hierarchy, not the source page's overall
  // zoom. The dominant non-heading text size becomes the blog's 18px body.
  function normalizePaste(html) {
    const raw = new DOMParser().parseFromString(html, 'text/html');
    // Word/Docs exports sometimes put font rules in classes, rather than inline.
    raw.querySelectorAll('style').forEach(sheet => {
      for (const match of sheet.textContent.matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
        if (match[1].includes('@')) continue;
        try {
          const style = document.createElement('span').style; style.cssText = match[2];
          raw.body.querySelectorAll(match[1].trim()).forEach(node => {
            [...style].filter(name => STYLES.has(name)).forEach(name => {
              if (!node.style.getPropertyValue(name)) node.style.setProperty(name,style.getPropertyValue(name));
            });
          });
        } catch { /* Ignore unsupported selectors from the source application. */ }
      }
    });
    raw.querySelectorAll('font').forEach(node => {
      const span = raw.createElement('span');
      if (node.face) span.style.fontFamily = node.face;
      if (node.size) span.style.fontSize = `${[10,10,13,16,18,24,32,48][Math.min(7,+node.size)] || 16}px`;
      span.append(...node.childNodes); node.replaceWith(span);
    });
    const doc = new DOMParser().parseFromString(sanitize(raw.body.innerHTML), 'text/html');
    const weights = new Map(), leaves = [];
    const walk = (node, inherited = 16, family = '', heading = false, explicit = false) => {
      if (node.nodeType === 3) {
        const length = node.textContent.trim().length;
        if (length) { leaves.push({ node, size: inherited, family, explicit, heading }); if (!heading) weights.set(inherited,(weights.get(inherited)||0)+length); }
        return;
      }
      if (node.nodeType !== 1) return;
      const isHeading = heading || /^H[1-6]$/.test(node.tagName);
      const fallback = /^H[1-6]$/.test(node.tagName) ? 16 * ({H1:2,H2:1.5,H3:1.25,H4:1.1,H5:1,H6:0.9}[node.tagName]) : inherited;
      const size = node.style.fontSize ? fontPixels(node.style.fontSize,inherited) : fallback;
      [...node.childNodes].forEach(child => walk(child,size,node.style.fontFamily || family,isHeading,explicit || Boolean(node.style.fontSize)));
    };
    walk(doc.body);
    const base = [...weights].sort((a,b) => b[1]-a[1])[0]?.[0] || 16;
    doc.body.querySelectorAll('[style]').forEach(node => { node.style.removeProperty('font-size'); node.style.removeProperty('font-family'); });
    leaves.forEach(({node,size,family,explicit,heading}) => {
      const span = doc.createElement('span');
      if (explicit || !heading) span.style.fontSize = `${Math.round(Math.max(8,Math.min(90,BASE_SIZE*size/base))*100)/100}px`;
      if (family) span.style.fontFamily = family;
      node.replaceWith(span); span.append(node);
    });
    return doc.body.innerHTML;
  }

  function create(options) {
    const source = document.querySelector('#postBody'), root = document.querySelector('#richEditor');
    const preview = document.querySelector('#preview'), toolbar = document.querySelector('.editor-toolbar');
    const Delta = Quill.import('delta'), Parchment = Quill.import('parchment');
    const Size = Quill.import('attributors/style/size'), Font = Quill.import('attributors/style/font');
    Size.whitelist = null; Font.whitelist = null;
    const Weight = new Parchment.StyleAttributor('weight','font-weight',{scope:Parchment.Scope.INLINE,whitelist:['400','500','600','700','800','900']});
    Quill.register(Size,true); Quill.register(Font,true); Quill.register(Weight,true);
    Quill.register(Quill.import('attributors/style/align'),true);
    const BlockEmbed = Quill.import('blots/block/embed');
    class MediaImage extends BlockEmbed {
      static blotName = 'mediaImage'; static tagName = 'IMG';
      static create(value) {
        const node=super.create(); const item=typeof value==='string'?{url:value}:value;
        node.src=safeURL(item.previewUrl || item.url);node.dataset.mediaUrl=safeURL(item.url);node.alt=item.alt||'';return node;
      }
      static value(node) { return { url:node.dataset.mediaUrl||node.getAttribute('src'),previewUrl:node.getAttribute('src'),alt:node.alt }; }
      html() { const v=MediaImage.value(this.domNode);return `<img src="${escape(safeURL(v.url))}" alt="${escape(v.alt)}">`; }
    }
    class MediaVideo extends BlockEmbed {
      static blotName = 'mediaVideo'; static tagName = 'VIDEO';
      static create(value) {
        const node=super.create();const item=typeof value==='string'?{url:value}:value;
        node.src=safeURL(item.previewUrl||item.url);node.dataset.mediaUrl=safeURL(item.url);node.controls=true;node.preload='metadata';node.setAttribute('playsinline','');return node;
      }
      static value(node) { return {url:node.dataset.mediaUrl||node.getAttribute('src'),previewUrl:node.getAttribute('src')}; }
      html() { return `<video src="${escape(safeURL(MediaVideo.value(this.domNode).url))}" controls playsinline preload="metadata"></video>`; }
    }
    class PendingMedia extends BlockEmbed {
      static blotName='pendingMedia';static tagName='DIV';static className='pending-media';
      static create(value) { const node=super.create();node.dataset.uploadId=value.id;node.textContent=`正在上传：${value.name}`;node.setAttribute('contenteditable','false');return node; }
      static value(node) { return {id:node.dataset.uploadId,name:node.textContent}; }
    }
    class Divider extends BlockEmbed { static blotName='divider';static tagName='HR'; }
    Quill.register(MediaImage,true);Quill.register(MediaVideo,true);Quill.register(PendingMedia,true);Quill.register(Divider,true);
    const editor=new Quill(root,{theme:null,placeholder:'在这里写正文，选中文字即可排版，也可以粘贴文章或拖入图片、视频。',modules:{toolbar:false,history:{delay:500,maxStack:100,userOnly:true}}});
    editor.root.setAttribute('aria-label','文章正文');editor.root.setAttribute('role','textbox');editor.root.setAttribute('aria-multiline','true');
    editor.clipboard.addMatcher('IMG',(node)=>safeURL(node.getAttribute('src'))?new Delta().insert({mediaImage:{url:safeURL(node.getAttribute('src')),alt:node.alt||''}}):new Delta());
    editor.clipboard.addMatcher('VIDEO',(node)=>new Delta().insert({mediaVideo:{url:safeURL(node.getAttribute('src')||node.querySelector('source')?.getAttribute('src'))}}));
    editor.clipboard.addMatcher('HR',()=>new Delta().insert({divider:true}));
    let savedRange={index:0,length:0}, loading=false, sourceMode=false, sourceChanged=false, epoch=0, enabled=true, pendingTarget='body';
    const uploads=new Map();
    function sync() {
      if (loading || sourceMode) return;
      const html=sanitize(editor.getSemanticHTML());
      source.value=editor.getText().trim() || /<(img|video|hr)\b/.test(html) ? `<div class="blog-rich-text" markdown="0">\n${html}\n</div>` : '';
      source.dispatchEvent(new CustomEvent('editor-change'));
    }
    function selection() {
      const range=editor.getSelection()||savedRange;return {index:Math.min(range.index,editor.getLength()-1),length:Math.min(range.length,Math.max(0,editor.getLength()-1-range.index))};
    }
    function restore() {const range=selection();editor.focus({preventScroll:true});editor.setSelection(range.index,range.length,'silent');return range;}
    function set(sourceText) {
      epoch++;uploads.forEach(item=>item.xhr?.abort());uploads.clear();renderQueue();loading=true;
      source.value=sourceText||'';editor.setContents(editor.clipboard.convert({html:render(source.value)}),'silent');
      editor.history.clear();savedRange={index:0,length:0};loading=false;sourceChanged=false;updatePreview();
      ['fontFamilySelect','fontSizeSelect','fontWeightSelect','textAlignSelect'].forEach(id=>{document.getElementById(id).value='';});
    }
    function updatePreview() {if(sourceMode)preview.innerHTML=render(source.value);}
    function toggleMode(next) {
      if(next===sourceMode)return;
      if(uploads.size && [...uploads.values()].some(i=>i.status!=='done'))return options.toast('请先完成、重试或移除上传任务');
      if(!next && sourceChanged){loading=true;editor.setContents(editor.clipboard.convert({html:render(source.value)}),'silent');editor.history.clear();loading=false;sourceChanged=false;}
      sourceMode=next;source.hidden=!next;preview.hidden=!next;root.hidden=next;toolbar.hidden=next;
      document.querySelector('#visualModeBtn').setAttribute('aria-pressed',String(!next));document.querySelector('#sourceModeBtn').setAttribute('aria-pressed',String(next));
      document.querySelector('#visualModeBtn').classList.toggle('active',!next);document.querySelector('#sourceModeBtn').classList.toggle('active',next);
      document.querySelector('#mediaDropZone').hidden=next;updatePreview();
    }
    editor.on('text-change',(_delta,_old,origin)=>{if(origin==='user'){sync();savedRange=editor.getSelection()||savedRange;}});
    editor.on('selection-change',range=>{
      if(!range)return;savedRange=range;
      const formats=editor.getFormat(range);
      [['fontFamilySelect','font'],['fontSizeSelect','size'],['fontWeightSelect','weight'],['textAlignSelect','align']].forEach(([id,name])=>{
        const control=document.getElementById(id);const value=name==='weight'&&formats.bold?'700':formats[name]||'';
        control.value=Array.isArray(value)?'':value;
      });
    });
    source.addEventListener('input',()=>{sourceChanged=true;updatePreview();});
    document.querySelector('#visualModeBtn').addEventListener('click',()=>toggleMode(false));document.querySelector('#sourceModeBtn').addEventListener('click',()=>toggleMode(true));
    toolbar.querySelectorAll('button').forEach(b=>b.addEventListener('mousedown',event=>event.preventDefault()));
    function format(name,value) {
      if(!enabled)return;
      restore();editor.history.cutoff();editor.format(name,value,'user');editor.history.cutoff();sync();
    }
    [['fontFamilySelect','font'],['fontSizeSelect','size'],['fontWeightSelect','weight'],['textAlignSelect','align']].forEach(([id,name])=>{
      document.getElementById(id).addEventListener('change',event=>{
        if(name==='weight'){restore();editor.format('bold',false,'user');}
        format(name,event.target.value||false);
      });
    });
    toolbar.querySelectorAll('[data-format]').forEach(button=>button.addEventListener('click',()=>{
      if(!enabled)return;
      const cmd=button.dataset.format,range=restore(),current=editor.getFormat(range);
      if(cmd==='undo'||cmd==='redo'){editor.history[cmd]();sync();return;}
      if(cmd==='clean'){editor.removeFormat(range.index,range.length,'user');sync();return;}
      if(cmd==='paragraph'||cmd==='h2'||cmd==='h3'){
        const start=range.index-editor.getLine(range.index)[1];
        const [last,offset]=editor.getLine(range.index+range.length);
        const end=range.index+range.length-offset+last.length();
        editor.formatText(start,end-start,'size',false,'user');
        editor.formatLine(start,end-start,'header',cmd==='paragraph'?false:Number(cmd.slice(1)),'user');sync();return;
      }
      if(['bold','italic','underline'].includes(cmd)){if(cmd==='bold')editor.format('weight',false,'user');format(cmd,!current[cmd]);return;}
      if(cmd==='quote'){format('blockquote',!current.blockquote);return;}
      if(cmd==='bullet'||cmd==='number'){const list=cmd==='bullet'?'bullet':'ordered';format('list',current.list===list?false:list);return;}
      if(cmd==='divider'){editor.insertEmbed(range.index,'divider',true,'user');editor.setSelection(range.index+1,0,'silent');sync();return;}
      if(cmd==='link'){
        const value=window.prompt('输入链接地址（留空可移除链接）',current.link||'https://');if(value===null)return;
        if(value&&!safeURL(value))return options.toast('请输入有效的 http(s) 链接');
        restore();if(!range.length&&value){editor.insertText(range.index,value,{link:value},'user');}else editor.format('link',value||false,'user');sync();
      }
    }));
    editor.root.addEventListener('paste',event=>{
      if(!enabled)return;event.preventDefault();event.stopImmediatePropagation();
      const files=[...(event.clipboardData?.files||[])];if(files.length){queueFiles(files,'body');return;}
      const html=event.clipboardData?.getData('text/html'),text=event.clipboardData?.getData('text/plain')||'';
      const range=restore();const delta=html?editor.clipboard.convert({html:normalizePaste(html)}):new Delta().insert(text);
      editor.history.cutoff();editor.updateContents(new Delta().retain(range.index).delete(range.length).concat(delta),'user');
      editor.setSelection(range.index+delta.length(),0,'silent');savedRange=editor.getSelection()||savedRange;editor.history.cutoff();sync();
    },true);

    function renderQueue() {
      const list=document.querySelector('#mediaQueue');list.replaceChildren();
      uploads.forEach(item=>{
        const row=document.createElement('li'),label=document.createElement('span');
        label.textContent=`${item.file.name} · ${item.status==='done'?'已上传':item.status==='error'?item.error:item.status==='waiting'?'等待上传':`上传中 ${item.percent}%`}`;row.append(label);
        if(item.status==='uploading'){const progress=document.createElement('progress');progress.max=100;progress.value=item.percent;progress.setAttribute('aria-label',item.file.name+'上传进度');row.append(progress);}
        if(item.status==='error'){const retry=document.createElement('button');retry.type='button';retry.textContent='重试';retry.className='ghost';retry.onclick=()=>{item.status='waiting';item.error='';renderQueue();drain();};row.append(retry);}
        if(item.status!=='done'){const remove=document.createElement('button');remove.type='button';remove.textContent='移除';remove.className='ghost';remove.onclick=()=>removeUpload(item);row.append(remove);}
        list.append(row);
      });
      const unresolved=[...uploads.values()].filter(i=>i.status!=='done').length;
      options.onUploads(unresolved);document.querySelector('#mediaStatus').textContent=unresolved?'上传完成后会自动插入，失败的任务可重试或移除。':uploads.size?'上传完成。正文已插入媒体；发布文章后可在博客中查看。':'';
    }
    function findPending(id) { const node=[...editor.root.querySelectorAll('[data-upload-id]')].find(n=>n.dataset.uploadId===id);return node?Quill.find(node):null; }
    function removeUpload(item) {
      uploads.delete(item.id);item.xhr?.abort();const blot=findPending(item.id);if(blot)editor.deleteText(editor.getIndex(blot),1,'api');renderQueue();sync();
    }
    async function queueFiles(files,target='body') {
      if(!enabled)return;
      try { options.requireConnection(); } catch(error){options.toast(error.message);return;}
      if(sourceMode && target==='body')return options.toast('请切换到可视化编辑后插入媒体');
      const chosen=target==='body'?[...files]:[...files].slice(0,1);
      for(const file of chosen){
        const extension=file.name.split('.').pop().toLowerCase(),type=TYPES[extension];
        if(!type || (file.type && file.type!==type && !(type==='image/jpeg'&&file.type==='image/jpg'))){options.toast(`不支持 ${file.name}，请选择 JPG、PNG、GIF、WebP、AVIF、MP4、MOV 或 WebM`);continue;}
        if(target==='video'&&!type.startsWith('video/')||['cover','poster'].includes(target)&&!type.startsWith('image/')){options.toast('请选择对应类型的文件');continue;}
        const limit=(type.startsWith('video/')?50:20)*1024*1024;
        if(!file.size||file.size>limit){options.toast(`${file.name} ${!file.size?'是空文件':`超过 ${limit/1024/1024} MB，请压缩后上传`}`);continue;}
        const id=crypto.randomUUID(),item={id,file,type,target,status:'waiting',percent:0,epoch,connection:options.getConnection()};uploads.set(id,item);
        if(target==='body'){const range=restore();editor.insertEmbed(range.index,'pendingMedia',{id,name:file.name},'api');editor.setSelection(range.index+1,0,'silent');savedRange=editor.getSelection()||savedRange;}
      }
      renderQueue();drain();
    }
    let draining=false;
    async function drain() {
      if(draining)return;draining=true;
      try {
        for(;;){
          const item=[...uploads.values()].find(i=>i.status==='waiting');if(!item)break;
          item.status='uploading';item.attempt=(item.attempt||0)+1;renderQueue();
          try {
            const result=await upload(item,percent=>{item.percent=percent;renderQueue();});
            if(item.epoch!==epoch||!uploads.has(item.id))continue;
            if(item.target==='body'){
              const blot=findPending(item.id);
              if(blot){
                const index=editor.getIndex(blot);editor.deleteText(index,1,'api');editor.history.cutoff();
                editor.insertEmbed(index,item.type.startsWith('video/')?'mediaVideo':'mediaImage',{url:result.url,previewUrl:result.previewUrl,alt:item.file.name},'user');editor.history.cutoff();
              }
            } else {
              const field=document.querySelector({cover:'#postImage',poster:'#postVideoPoster',video:'#postVideoUrl'}[item.target]);field.value=result.url;field.dispatchEvent(new Event('input',{bubbles:true}));
            }
            item.status='done';sync();
          } catch(error) {
            if(item.epoch!==epoch||!uploads.has(item.id))continue;item.status='error';item.error=error.message||'上传失败，请重试';
            const blot=findPending(item.id);if(blot)blot.domNode.textContent=`上传失败：${item.file.name}（请在下方重试或移除）`;
          }
          renderQueue();
        }
      } finally {draining=false;}
    }
    const picker=document.querySelector('#mediaFileInput');
    function pick(target){pendingTarget=target;picker.multiple=target==='body';picker.accept=target==='video'?'video/mp4,video/webm,video/quicktime':target==='body'?'image/jpeg,image/png,image/gif,image/webp,image/avif,video/mp4,video/webm,video/quicktime':'image/jpeg,image/png,image/gif,image/webp,image/avif';picker.click();}
    document.querySelectorAll('[data-upload-target]').forEach(button=>button.addEventListener('click',()=>pick(button.dataset.uploadTarget)));
    picker.addEventListener('change',()=>{queueFiles(picker.files,pendingTarget);picker.value='';});
    const drop=document.querySelector('#mediaDropZone');drop.addEventListener('click',()=>pick('body'));
    [drop,editor.root].forEach(target=>{
      target.addEventListener('dragover',event=>{if([...event.dataTransfer.types].includes('Files')){event.preventDefault();event.dataTransfer.dropEffect='copy';target.classList.add('is-dragging');}});
      target.addEventListener('dragleave',()=>target.classList.remove('is-dragging'));
      target.addEventListener('drop',event=>{if(event.dataTransfer.files.length){event.preventDefault();event.stopPropagation();target.classList.remove('is-dragging');queueFiles(event.dataTransfer.files,'body');}});
    });
    document.addEventListener('dragover',event=>{if([...event.dataTransfer.types].includes('Files'))event.preventDefault();});
    document.addEventListener('drop',event=>{if(event.dataTransfer.files.length)event.preventDefault();});
    return { set, updatePreview, getValue:()=>source.value, setEnabled(value){enabled=value;editor.enable(value);}, hasUploads:()=>[...uploads.values()].some(i=>i.status!=='done') };
  }

  async function upload(item,onProgress) {
    const {file,type,connection,id}=item;
    const date=new Date().toISOString().slice(0,7),extension=file.name.split('.').pop().toLowerCase();
    const path=`media/uploads/${date}/${id}.${extension}`;
    let url,body,headers;
    if(connection.mode==='worker'){
      const params=new URLSearchParams({id,name:file.name,size:String(file.size),month:date,retry:item.attempt>1?'1':'0'});
      url=`${connection.apiBase}/media?${params}`;body=file;headers={'Content-Type':type,'X-Admin-Password':connection.password};
    }else{
      url=`https://api.github.com/repos/wangqiwei366/wangqiwei366.github.io/contents/${path}`;
      headers={'Content-Type':'application/json',Accept:'application/vnd.github+json',Authorization:`Bearer ${connection.token}`,'X-GitHub-Api-Version':'2022-11-28'};
      if(item.attempt>1){
        const existing=await fetch(url+'?ref=master',{headers});
        if(existing.ok){const saved=await existing.json();if(saved.size===file.size)return {url:`https://wangqiwei366.github.io/${path}`,previewUrl:`https://raw.githubusercontent.com/wangqiwei366/wangqiwei366.github.io/master/${path}`};throw new Error('上传标识已存在，请移除后重新选择文件');}
        if(existing.status!==404)throw new Error(`暂时无法确认上传状态（${existing.status}），请重试`);
      }
      const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('无法读取文件，请重新选择'));reader.readAsDataURL(file);});
      body=JSON.stringify({message:`Upload media ${path}`,content:base64,branch:'master'});
    }
    const data=await new Promise((resolve,reject)=>{
      const xhr=new XMLHttpRequest();item.xhr=xhr;xhr.open(connection.mode==='worker'?'POST':'PUT',url);xhr.timeout=300000;
      Object.entries(headers).forEach(([key,value])=>xhr.setRequestHeader(key,value));
      xhr.upload.onprogress=event=>{if(event.lengthComputable)onProgress(Math.min(99,Math.round(event.loaded/event.total*100)));};
      xhr.onerror=()=>reject(new Error('网络中断，文件和正文已保留，请重试'));xhr.ontimeout=()=>reject(new Error('上传超时，请重试'));xhr.onabort=()=>reject(new Error('上传已取消'));
      xhr.onload=()=>{let value;try{value=JSON.parse(xhr.responseText);}catch{return reject(new Error(`上传返回异常（${xhr.status}）`));}if(xhr.status>=200&&xhr.status<300)resolve(value);else reject(new Error(value.error||value.message||`上传失败（${xhr.status}）`));};xhr.send(body);
    });
    if(connection.mode==='worker')return data.media;
    return {url:`https://wangqiwei366.github.io/${path}`,previewUrl:`https://raw.githubusercontent.com/wangqiwei366/wangqiwei366.github.io/${data.commit.sha}/${path}`};
  }
  window.BlogEditor={create,render,sanitize,normalizePaste};
})();
