// One-off generator: builds the ViralStrip component code with guaranteed
// paren balance by constructing the React element tree structurally.
const fs = require('fs')

function el(name, props, ...children) {
  const args = children.map((c) => `,${typeof c === 'string' ? c : capture(c)}`).join('')
  return `React.createElement(${name},${props}${args})`
}

function capture(emit) {
  const buf = []
  emit(buf)
  return buf.join('')
}

const body = el(
  '"div"',
  '{className:"flex flex-col gap-2 mt-2"}',
  el('"p"', '{className:"text-[11px] font-bold uppercase tracking-wide text-slate-400"}', '"Storie virali per famiglie · Italia"'),
  el(
    '"div"',
    '{className:"flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1"}',
    `t.map(s=>${el(
      '"a"',
      '{key:s.id,href:s.sourceUrl,target:"_blank",rel:"noopener noreferrer",className:"shrink-0 w-56 p-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition flex flex-col gap-1"}',
      el(
        '"span"',
        '{className:"flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-coral-300"}',
        el('Icon', '{name:"flame",className:"w-3 h-3"}'),
        's.zone',
      ),
      el('"span"', '{className:"text-xs font-bold text-white line-clamp-2"}', 's.title'),
      el('"span"', '{className:"text-[11px] text-slate-400 line-clamp-2"}', 's.description'),
      el(
        '"span"',
        '{className:"text-[10px] text-slate-500"}',
        'new Date(s.publishedAt).toLocaleDateString("it-IT",{day:"numeric",month:"short"})+" · "+s.source',
      ),
    )})`,
  ),
)

const fn = `function ViralStrip({zone:e}){const[t,a]=useState(null);useEffect(()=>{let c=!0;fetch("/api/viral").then(r=>r.json()).then(r=>{c&&a(r.stories||[])}).catch(()=>{});return()=>{c=!1}},[]);if(!t||0===t.length)return null;return ${body}}`

const srcPath = 'public/app.js'
let src = fs.readFileSync(srcPath, 'utf8')
const start = src.indexOf('function ViralStrip')
const end = src.indexOf('function CreatorStrip', start)
if (start === -1 || end === -1) {
  console.log('anchors missing')
  process.exit(1)
}
src = src.slice(0, start) + fn + src.slice(end)
fs.writeFileSync(srcPath, src)
console.log('written ok, function length:', fn.length)
