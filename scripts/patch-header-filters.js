// One-off patcher: header season select, auto season default, remove search field.
const fs = require('fs')

const path = 'public/app.js'
let src = fs.readFileSync(path, 'utf8')
const orig = src

// 1. Season state defaults to the current season (was "Tutte")
const seasonInit = '[E,N]=useState("Tutte")'
const seasonNew =
  '[E,N]=useState((()=>{const mo=new Date().getMonth();return mo<=1||mo===11?"Inverno":mo<=4?"Primavera":mo<=7?"Estate":"Autunno"})())'
if (!src.includes(seasonInit)) { console.log('E1: season state not found'); process.exit(1) }
src = src.replace(seasonInit, seasonNew)

// 2. Remove the keyword search field (input + lens icon) from the search panel
const searchStart = 'React.createElement("div",{className:"relative flex-1"},React.createElement("label",{htmlFor:"search"'
const searchEnd = 'React.createElement(Icon,{name:"search",className:"w-4 h-4"})))'
const a = src.indexOf(searchStart)
if (a === -1) { console.log('E2a: search block start not found'); process.exit(1) }
const b = src.indexOf(searchEnd, a)
if (b === -1) { console.log('E2b: search block end not found'); process.exit(1) }
src = src.slice(0, a) + src.slice(b + searchEnd.length)

// 3. Drop the search text from the filtering logic and its memo dependency
const filterX =
  'if(x){const t=x.toLowerCase(),a=e.title.toLowerCase().includes(t),i=e.description.toLowerCase().includes(t),r=e.city.toLowerCase().includes(t);if(!a&&!i&&!r)return!1}'
if (!src.includes(filterX)) { console.log('E3a: search filter not found'); process.exit(1) }
src = src.replace(filterX, '')
const deps = '[o,l,d,g,R,E,y,I,k,A,x])'
if (!src.includes(deps)) { console.log('E3b: memo deps not found'); process.exit(1) }
src = src.replace(deps, '[o,l,d,g,R,E,y,I,k,A])')

// 4. Remove the Stagione chip row from the advanced filters panel
const stagStart = 'React.createElement("div",null,React.createElement("p",{className:"text-[11px] font-semibold text-slate-400 mb-2 pl-1"},"Stagione")'
const nextSection = 'React.createElement("div",null,React.createElement("p",{className:"text-[11px] font-semibold text-slate-400 mb-2 pl-1"},"Età dei bambini")'
const c = src.indexOf(stagStart)
if (c === -1) { console.log('E4a: season chips start not found'); process.exit(1) }
const d = src.indexOf(nextSection, c)
if (d === -1) { console.log('E4b: next section not found'); process.exit(1) }
src = src.slice(0, c) + src.slice(d)

// 5. Compact season select in the header, left of the Guida/Preferiti nav
const navOpen =
  'React.createElement("nav",{className:"hidden md:flex items-center gap-2","aria-label":"Navigazione principale"},'
const selectEl =
  'React.createElement("select",{id:"season-top",value:E,onChange:e=>N(e.target.value),"aria-label":"Stagione",className:"glass-input rounded-full px-3 h-10 text-xs font-semibold max-w-[9.5rem]"},' +
  '["Tutte","Primavera","Estate","Autunno","Inverno"].map(s=>React.createElement("option",{key:s,value:s},s==="Tutte"?"Tutte le stagioni":s)))'
if (!src.includes(navOpen)) { console.log('E5a: header nav not found'); process.exit(1) }
src = src.replace(
  navOpen,
  'React.createElement("div",{className:"flex items-center gap-2"},' + selectEl + ',' + navOpen,
)
// close the wrapper right after the nav element (before the mobile GPS button)
const navCloseAnchor = ',"Preferiti"),React.createElement("span",{className:"min-w-5 h-5 px-1.5 grid place-items-center rounded-full bg-white/15 text-[10px] font-bold"},l.length))),React.createElement("button",{onClick:ce,disabled:$,'
if (!src.includes(navCloseAnchor)) { console.log('E5b: header nav close not found'); process.exit(1) }
src = src.replace(
  navCloseAnchor,
  ',"Preferiti"),React.createElement("span",{className:"min-w-5 h-5 px-1.5 grid place-items-center rounded-full bg-white/15 text-[10px] font-bold"},l.length)))),React.createElement("button",{onClick:ce,disabled:$,',
)

fs.writeFileSync(path, src)
console.log('patched ok, delta bytes:', src.length - orig.length)
