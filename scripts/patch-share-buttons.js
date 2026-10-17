// One-off patcher: add WhatsApp + Email share buttons to the day-plan modal.
const fs = require('fs')

const path = 'public/app.js'
let src = fs.readFileSync(path, 'utf8')
const orig = src

const helper = [
  'function planShareText(place,plan){',
  'const L=["Programma della giornata: "+place.title];',
  'if(place.city)L.push("Luogo: "+place.city);',
  'for(const s of plan.sections){L.push(s.title+":");for(const it of s.items){L.push(it.time?it.time+" - "+it.text:"- "+it.text)}}',
  'return L.join("\\n")};',
  'function CreatorStrip',
].join('')

if (!src.includes('function CreatorStrip')) { console.log('E0: anchor missing'); process.exit(1) }
src = src.replace('function CreatorStrip', helper)

const printRow =
  'React.createElement("button",{onClick:()=>window.print(),className:"h-10 px-4 rounded-full bg-white/10 text-mint-300 hover:bg-white/15 font-bold inline-flex items-center gap-2 text-xs"},React.createElement(Icon,{name:"printer",className:"w-4 h-4"}),"Scarica / Stampa PDF"))'
const shareRow =
  'React.createElement("div",{className:"flex gap-2 mt-2"},' +
  'React.createElement("button",{onClick:()=>window.open("https://wa.me/?text="+encodeURIComponent(planShareText(C,O)),"_blank","noopener,noreferrer"),className:"flex-1 h-10 rounded-full bg-[#25D366]/15 border border-[#25D366]/40 text-[#25D366] hover:bg-[#25D366]/25 font-bold inline-flex items-center justify-center gap-2 text-xs"},React.createElement(Icon,{name:"share-2",className:"w-4 h-4"}),"Condividi su WhatsApp"),' +
  'React.createElement("button",{onClick:()=>{window.location.href="mailto:?subject="+encodeURIComponent("Programma della giornata: "+C.title)+"&body="+encodeURIComponent(planShareText(C,O))},className:"flex-1 h-10 rounded-full bg-white/10 border border-white/15 text-slate-100 hover:bg-white/15 font-bold inline-flex items-center justify-center gap-2 text-xs"},React.createElement(Icon,{name:"mail",className:"w-4 h-4"}),"Invia via email")))'
if (!src.includes(printRow)) { console.log('E1: print row not found'); process.exit(1) }
src = src.replace(
  printRow,
  'React.createElement("button",{onClick:()=>window.print(),className:"h-10 px-4 rounded-full bg-white/10 text-mint-300 hover:bg-white/15 font-bold inline-flex items-center gap-2 text-xs"},React.createElement(Icon,{name:"printer",className:"w-4 h-4"}),"Scarica / Stampa PDF"),' + shareRow,
)

fs.writeFileSync(path, src)
console.log('patched ok, delta bytes:', src.length - orig.length)
