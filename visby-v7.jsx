import { useState } from "react";

// ── TOKENS ────────────────────────────────────────────────────
const C = {
  navy:"#0E1420", card:"#fff", sub:"#F7F9FC",
  cyan:"#3EFFD8", blue:"#5B9BFF", mag:"#C742FF",
  teal:"#2DCFB3", text:"#1A1F2E", muted:"#8A93A8",
  border:"#E8ECF5", red:"#FF3B5C", green:"#00C48C", gold:"#FFB800",
};
const GH=`linear-gradient(90deg,${C.cyan},${C.blue} 50%,${C.mag})`;
const GD=`linear-gradient(135deg,${C.cyan},${C.blue} 50%,${C.mag})`;
const OG=[GD,`linear-gradient(135deg,${C.cyan},${C.teal})`,`linear-gradient(135deg,${C.blue},${C.mag})`,`linear-gradient(135deg,${C.teal},${C.blue})`,`linear-gradient(135deg,${C.mag},${C.cyan})`];

// ── LOGO ─────────────────────────────────────────────────────
function Mark({size=36}){
  const VW=285,VH=225,bw=size*(VH/VW);
  const cy=60*size/285,by=155*size/285,mb=210*size/285;
  const sc=size/285;
  const cyan=[{cx:11,ry:55},{cx:34,ry:54},{cx:57,ry:50},{cx:80,ry:45},{cx:103,ry:40},{cx:125,ry:34},{cx:146,ry:28},{cx:166,ry:22},{cx:185,ry:17},{cx:203,ry:12}];
  const blue=[{cx:80,ry:38},{cx:102,ry:37},{cx:123,ry:34},{cx:144,ry:29},{cx:164,ry:23},{cx:183,ry:17},{cx:201,ry:11}];
  const mag=[{cx:124,h:14},{cx:146,h:20},{cx:168,h:27},{cx:190,h:34},{cx:212,h:41},{cx:234,h:48},{cx:256,h:52}];
  return <svg width={size} height={bw} viewBox={`0 0 285 225`} style={{display:"block"}}>
    {cyan.map((b,i)=><ellipse key={`c${i}`} cx={b.cx} cy={60} rx={7.5} ry={b.ry} fill="#3EFFD8"/>)}
    {blue.map((b,i)=><ellipse key={`b${i}`} cx={b.cx} cy={155} rx={7} ry={b.ry} fill="#5B9BFF"/>)}
    {mag.map((b,i)=>{const bw2=b.h*0.18;return <polygon key={`m${i}`} points={`${b.cx},${210-b.h} ${b.cx-bw2},210 ${b.cx+bw2},210`} fill="#D040FF"/>;})}
  </svg>;
}
function Logo({h=20}){return <svg width={h*3.2} height={h} viewBox="0 0 115 32"><defs><linearGradient id="lg" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor={C.cyan}/><stop offset="50%" stopColor={C.blue}/><stop offset="100%" stopColor={C.mag}/></linearGradient></defs><text x="0" y="26" fontFamily="'DM Sans',sans-serif" fontSize="30" fontWeight="700" fill="url(#lg)" letterSpacing="-1">Visby</text></svg>;}

// ── ICONS ─────────────────────────────────────────────────────
const Ic={
  home: (a)=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a?C.teal:"rgba(255,255,255,.35)"} strokeWidth="1.8" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  search:(a)=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a?C.teal:"rgba(255,255,255,.35)"} strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  bell:  (a)=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a?C.teal:"rgba(255,255,255,.35)"} strokeWidth="1.8" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  user:  (a)=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={a?C.teal:"rgba(255,255,255,.35)"} strokeWidth="1.8" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  plus:  (c="#fff",s=20)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  back:  ()=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.8)" strokeWidth="1.8" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>,
  cart:  (n)=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={n?"rgba(255,255,255,.9)":"rgba(255,255,255,.35)"} strokeWidth="1.8" strokeLinecap="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>,
  heart: (f,s=18)=><svg width={s} height={s} viewBox="0 0 24 24" fill={f?C.red:"none"} stroke={f?C.red:C.muted} strokeWidth="1.8" strokeLinecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>,
  bkmrk: (f,s=18)=><svg width={s} height={s} viewBox="0 0 24 24" fill={f?C.teal:"none"} stroke={f?C.teal:C.muted} strokeWidth="1.8" strokeLinecap="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>,
  check: (c="#fff",s=10)=><svg width={s} height={s} viewBox="0 0 10 10" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round"><path d="M2 5l2.5 2.5 3.5-4"/></svg>,
  cam:   (s=32)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>,
  star:  (f,s=14)=><svg width={s} height={s} viewBox="0 0 24 24" fill={f?C.gold:"none"} stroke={C.gold} strokeWidth="1.8"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  nft:   (s=11)=><svg width={s} height={s} viewBox="0 0 24 24" fill={C.teal}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  chevR: ()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="1.8" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>,
  msg:   (a)=><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={a?C.teal:C.muted} strokeWidth="1.8" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  dollar:(s=18)=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="1.8" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  toggle:(on)=><div onClick={on.onClick} style={{width:44,height:24,borderRadius:12,background:on.v?C.teal:"rgba(255,255,255,.15)",position:"relative",cursor:"pointer",transition:"background .2s",flexShrink:0}}><div style={{position:"absolute",top:2,left:on.v?22:2,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/></div>,
};

// ── HELPERS ───────────────────────────────────────────────────
function Stars({r=4.9,s=13,interactive=false,onRate}){
  const [hov,setHov]=useState(0);
  return <span style={{display:"inline-flex",gap:2}}>{[1,2,3,4,5].map(i=><span key={i} onMouseEnter={()=>interactive&&setHov(i)} onMouseLeave={()=>interactive&&setHov(0)} onClick={()=>interactive&&onRate&&onRate(i)} style={{cursor:interactive?"pointer":"default"}}>{Ic.star(hov?i<=hov:i<=Math.round(r),s)}</span>)}</span>;
}
function Badge({children,color=C.teal}){return <span style={{fontSize:10,fontFamily:"'DM Mono',monospace",fontWeight:600,color,background:color+"18",borderRadius:6,padding:"3px 8px"}}>{children}</span>;}
function OwnerDots({count}){const show=Math.min(count,5);return <div style={{display:"flex",alignItems:"center"}}>{Array.from({length:show}).map((_,i)=><div key={i} style={{width:20,height:20,borderRadius:"50%",background:OG[i%OG.length],border:`2px solid ${C.card}`,marginLeft:i?-6:0,zIndex:show-i,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,fontWeight:700,color:"#fff"}}>{i===show-1&&count>5?"9+":""}</div>)}<span style={{marginLeft:6,fontSize:10,color:C.muted,fontFamily:"'DM Mono',monospace"}}>{count>9?"9+":count} owner{count!==1?"s":""}</span></div>;}
function Field({label,value,onChange,placeholder,type="text",multi=false,prefix}){
  const[f,setF]=useState(false);
  const style={width:"100%",background:f?"rgba(255,255,255,.08)":"rgba(255,255,255,.04)",border:`1px solid ${f?C.teal+"77":"rgba(255,255,255,.1)"}`,borderRadius:10,padding:prefix?"10px 12px 10px 32px":"10px 12px",color:"#fff",fontSize:14,outline:"none",fontFamily:"'DM Sans',sans-serif",transition:"all .2s"};
  return <div style={{marginBottom:12}}>
    {label&&<div style={{fontSize:11,color:C.muted,marginBottom:5,fontFamily:"'DM Mono',monospace",letterSpacing:"0.06em",textTransform:"uppercase"}}>{label}</div>}
    <div style={{position:"relative"}}>
      {prefix&&<span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.muted,fontSize:14,pointerEvents:"none"}}>{prefix}</span>}
      {multi?<textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} onFocus={()=>setF(true)} onBlur={()=>setF(false)} rows={3} style={{...style,resize:"none"}}/>
            :<input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} type={type} onFocus={()=>setF(true)} onBlur={()=>setF(false)} style={style}/>}
    </div>
  </div>;
}
function TopBar({cart=0,onCart,right,back,onBack,title}){
  return <div style={{position:"sticky",top:0,zIndex:100,background:"rgba(14,20,32,.97)",backdropFilter:"blur(20px)",borderBottom:"1px solid rgba(255,255,255,.06)",padding:"10px 16px",display:"flex",alignItems:"center",gap:10}}>
    {back?<button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",padding:4,display:"flex"}}>{Ic.back()}</button>
         :<div style={{display:"flex",alignItems:"center",gap:6}}><Mark size={32}/><Logo h={19}/></div>}
    {title&&<div style={{flex:1,textAlign:"center",fontSize:16,fontWeight:700,color:"#fff"}}>{title}</div>}
    <div style={{marginLeft:"auto",display:"flex",gap:12,alignItems:"center"}}>
      {right}
      {onCart!==undefined&&<button onClick={onCart} style={{background:"none",border:"none",cursor:"pointer",padding:4,position:"relative"}}>{Ic.cart(cart>0)}{cart>0&&<span style={{position:"absolute",top:0,right:0,width:14,height:14,borderRadius:"50%",background:C.red,fontSize:8,fontWeight:700,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center"}}>{cart}</span>}</button>}
    </div>
  </div>;
}

// ── DATA ──────────────────────────────────────────────────────
const ITEMS=[
  {id:1,name:"Nike Air Max 1 '86 OG",brand:"Nike",serial:"NK-2024-XR9471",price:340,retail:180,seller:"sneaker.vault",verified:true,bg:"#EEF2FF",owners:3,timeAgo:"2h",condition:"New",category:"Sneakers",views:1240,rating:4.9,reviews:87,desc:"Deadstock. Never worn, OG box. Authenticated on Solana."},
  {id:2,name:"Rolex Submariner Date",brand:"Rolex",serial:"RL-2019-BK7823",price:12400,retail:null,seller:"watches.eth",verified:true,bg:"#EEFBF7",owners:2,timeAgo:"5h",condition:"Excellent",category:"Watches",views:3410,rating:5.0,reviews:34,desc:"Full set, box + papers. Serviced 2023."},
  {id:3,name:"Signed Tom Brady Football",brand:"NFL",serial:"NFL-2020-TB0712",price:4800,retail:null,seller:"sports.legacy",verified:true,bg:"#FFF3EE",owners:1,timeAgo:"1d",condition:"Mint",category:"Memorabilia",views:892,rating:4.8,reviews:21,desc:"Hand-signed. COA included. Mint condition."},
  {id:4,name:"Hermès Birkin 30",brand:"Hermès",serial:"HM-2022-OR4401",price:28000,retail:null,seller:"luxe.provenance",verified:true,bg:"#FDF0FF",owners:1,timeAgo:"2d",condition:"New",category:"Bags",views:7200,rating:5.0,reviews:12,desc:"Brand new, full set. Hermès Paris 2022."},
  {id:5,name:"Levi's 501 — 1978 Original",brand:"Levi's",serial:"LV-1978-VT0093",price:890,retail:null,seller:"vintage.wear",verified:false,bg:"#EEF6FF",owners:12,timeAgo:"3d",condition:"Good",category:"Vintage",views:440,rating:4.6,reviews:156,desc:"Selvedge denim. Size 32×34. 12 provenance records."},
  {id:6,name:"AirPods Pro 2nd Gen",brand:"Apple",serial:"AP-2023-WH0021",price:189,retail:249,seller:"tech.resell",verified:true,bg:"#F5EEFF",owners:2,timeAgo:"3d",condition:"Like New",category:"Electronics",views:620,rating:4.7,reviews:43,desc:"Battery 98%. All accessories included."},
];
const FOLLOWING_STORIES=["sneaker.v","watches","luxe.pro","drops","vintage"];
const CATS=["All","Sneakers","Watches","Bags","Memorabilia","Vintage","Electronics"];

// ══════════════════════════════════════════════════════════════
// PAGE 1 — HOME (wireframe row1, screen1)
// Feed cards: horizontal — [Photo left | Title/desc/price/NFT right]
// Stories row with "Following" label
// ══════════════════════════════════════════════════════════════
function HomePage({navigate,cart,addCart}){
  const[cat,setCat]=useState("All");
  const[likes,setLikes]=useState({});
  const filtered=ITEMS.filter(l=>cat==="All"||l.category===cat);
  return <div style={{background:C.navy,minHeight:"100vh"}}>
    <TopBar cart={cart} onCart={()=>navigate("explore")}/>
    <div style={{maxWidth:600,margin:"0 auto",padding:"0 14px"}}>

      {/* Stories / Following row */}
      <div style={{padding:"14px 0 10px"}}>
        <div style={{fontSize:11,color:C.muted,fontFamily:"'DM Mono',monospace",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:10}}>Following</div>
        <div style={{display:"flex",gap:14,overflowX:"auto",scrollbarWidth:"none"}}>
          {FOLLOWING_STORIES.map((s,i)=>(
            <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5,flexShrink:0,cursor:"pointer"}}>
              <div style={{padding:2,background:GD,borderRadius:"50%"}}>
                <div style={{padding:2,background:C.navy,borderRadius:"50%"}}>
                  <div style={{width:46,height:46,borderRadius:"50%",background:OG[i%OG.length],display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,color:"#fff",fontFamily:"'DM Sans',sans-serif"}}>{s[0].toUpperCase()}</div>
                </div>
              </div>
              <span style={{fontSize:9,color:"rgba(255,255,255,.4)",maxWidth:50,textAlign:"center",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Category pills */}
      <div style={{display:"flex",gap:8,overflowX:"auto",marginBottom:14,scrollbarWidth:"none"}}>
        {CATS.map(c=><button key={c} onClick={()=>setCat(c)} style={{background:cat===c?GH:"rgba(255,255,255,.05)",border:`1px solid ${cat===c?"transparent":"rgba(255,255,255,.08)"}`,borderRadius:20,padding:"6px 14px",fontSize:12,fontWeight:cat===c?700:400,color:cat===c?"#fff":"rgba(255,255,255,.5)",cursor:"pointer",flexShrink:0,fontFamily:"'DM Sans',sans-serif",whiteSpace:"nowrap"}}>{c}</button>)}
      </div>

      {/* Feed — HORIZONTAL cards matching wireframe */}
      <div style={{display:"flex",flexDirection:"column",gap:10,paddingBottom:90}}>
        {filtered.map((item,i)=>(
          <div key={item.id} style={{background:C.card,borderRadius:14,padding:12,display:"flex",gap:12,border:`1px solid ${C.border}`,animation:`fadeUp .35s ${i*.06}s ease both`,opacity:0,cursor:"pointer"}}
            onMouseEnter={e=>e.currentTarget.style.boxShadow=`0 4px 20px rgba(45,207,179,.1)`}
            onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>

            {/* Left: photo thumbnail */}
            <div onClick={()=>navigate("detail",item)} style={{width:90,height:90,borderRadius:10,background:item.bg,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:8,color:"rgba(0,0,0,.2)",textTransform:"uppercase",textAlign:"center",lineHeight:1.4,padding:4}}>{item.category}</span>
              <div style={{position:"absolute",bottom:5,left:5,display:"flex",alignItems:"center",gap:3,background:"rgba(255,255,255,.9)",borderRadius:4,padding:"2px 5px"}}>{Ic.nft(8)}<span style={{fontSize:7,color:C.teal,fontFamily:"'DM Mono',monospace",fontWeight:600}}>NFT</span></div>
            </div>

            {/* Right: details */}
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:3}}>
                <div style={{fontWeight:700,fontSize:14,color:C.text,lineHeight:1.3,flex:1,marginRight:8}}>{item.name}</div>
                <button onClick={()=>setLikes(p=>({...p,[item.id]:!p[item.id]}))} style={{background:"none",border:"none",cursor:"pointer",padding:0,flexShrink:0}}>{Ic.heart(likes[item.id],16)}</button>
              </div>

              <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:4}}>
                <div style={{width:22,height:22,borderRadius:"50%",background:GD,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:"#fff"}}>{item.seller[0].toUpperCase()}</div>
                <span style={{fontSize:11,color:C.muted}}>@{item.seller}</span>
                {item.verified&&<div style={{width:12,height:12,borderRadius:"50%",background:C.teal,display:"flex",alignItems:"center",justifyContent:"center"}}>{Ic.check("#fff",7)}</div>}
                <Stars r={item.rating} s={10}/>
              </div>

              <div style={{fontSize:11,color:C.muted,marginBottom:6,fontFamily:"'DM Mono',monospace"}}>SN: {item.serial}</div>

              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div>
                  <span style={{fontSize:18,fontWeight:800,background:GH,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>${item.price.toLocaleString()}</span>
                  {item.retail&&<span style={{fontSize:11,color:C.muted,textDecoration:"line-through",marginLeft:6,fontFamily:"'DM Mono',monospace"}}>${item.retail}</span>}
                </div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>navigate("checkout",item)} style={{background:GH,border:"none",borderRadius:8,padding:"6px 12px",fontSize:11,fontWeight:700,color:"#fff",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>Buy</button>
                  <button onClick={()=>addCart(item.id)} style={{background:"rgba(91,155,255,.15)",border:`1px solid ${C.blue}44`,borderRadius:8,padding:"6px 10px",fontSize:11,color:C.blue,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>+ Cart</button>
                </div>
              </div>
              <div style={{marginTop:6}}><OwnerDots count={item.owners}/></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>;
}

// ══════════════════════════════════════════════════════════════
// PAGE 2 — EXPLORE / SEARCH (row1, screen2)
// Search bar + 2-column grid with circles+price+description
// ══════════════════════════════════════════════════════════════
function ExplorePage({navigate}){
  const[q,setQ]=useState("");
  const[sf,setSf]=useState(false);
  const[cat,setCat]=useState("All");
  let results=ITEMS.filter(l=>(cat==="All"||l.category===cat)&&(!q||l.name.toLowerCase().includes(q.toLowerCase())));
  return <div style={{background:C.navy,minHeight:"100vh"}}>
    <TopBar/>
    <div style={{position:"sticky",top:58,zIndex:99,background:"rgba(14,20,32,.97)",backdropFilter:"blur(20px)",borderBottom:"1px solid rgba(255,255,255,.06)",padding:"10px 14px"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
        <div style={{position:"relative",flex:1}}>
          <span style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",pointerEvents:"none"}}>{Ic.search(false)}</span>
          <input autoFocus value={q} onChange={e=>setQ(e.target.value)} onFocus={()=>setSf(true)} onBlur={()=>setSf(false)} placeholder="Search…" style={{width:"100%",background:sf?"rgba(255,255,255,.08)":"rgba(255,255,255,.05)",border:`1px solid ${sf?C.teal+"66":"rgba(255,255,255,.09)"}`,borderRadius:12,padding:"10px 12px 10px 38px",color:"#fff",fontSize:14,outline:"none",fontFamily:"'DM Sans',sans-serif"}}/>
        </div>
      </div>
      <div style={{display:"flex",gap:8,overflowX:"auto",scrollbarWidth:"none"}}>
        {CATS.map(c=><button key={c} onClick={()=>setCat(c)} style={{background:cat===c?GH:"rgba(255,255,255,.05)",border:"none",borderRadius:16,padding:"5px 13px",fontSize:11,fontWeight:cat===c?700:400,color:cat===c?"#fff":"rgba(255,255,255,.45)",cursor:"pointer",flexShrink:0,fontFamily:"'DM Sans',sans-serif"}}>{c}</button>)}
      </div>
    </div>

    <div style={{maxWidth:600,margin:"0 auto",padding:"14px 14px 90px"}}>
      <div style={{fontSize:11,color:C.muted,fontFamily:"'DM Mono',monospace",marginBottom:12}}>{results.length} results</div>
      {/* 2-column grid matching wireframe */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {results.map((item,i)=>(
          <div key={item.id} onClick={()=>navigate("detail",item)} style={{background:C.card,borderRadius:14,overflow:"hidden",cursor:"pointer",border:`1px solid ${C.border}`,animation:`fadeUp .3s ${i*.05}s ease both`,opacity:0}}>
            {/* Image */}
            <div style={{background:item.bg,height:120,display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"rgba(0,0,0,.2)",textTransform:"uppercase"}}>{item.category}</span>
              <div style={{position:"absolute",top:7,left:7,background:"rgba(255,255,255,.9)",borderRadius:5,padding:"2px 6px",fontSize:9,fontWeight:600,color:C.text}}>{item.condition}</div>
            </div>
            {/* Info */}
            <div style={{padding:"10px 10px 12px"}}>
              {/* Seller circle + name */}
              <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:6}}>
                <div style={{width:24,height:24,borderRadius:"50%",background:OG[i%OG.length],display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:"#fff",flexShrink:0}}>{item.seller[0].toUpperCase()}</div>
                <span style={{fontSize:11,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>@{item.seller}</span>
              </div>
              <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:3,lineHeight:1.3}}>{item.name}</div>
              <div style={{fontSize:11,color:C.muted,marginBottom:7,lineHeight:1.4,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{item.desc}</div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <span style={{fontSize:16,fontWeight:800,background:GH,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>${item.price.toLocaleString()}</span>
                <Stars r={item.rating} s={10}/>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>;
}

// ══════════════════════════════════════════════════════════════
// PAGE 3 — SELL / MINT (row1, screen3 + row2, screen3)
// Photo grid → $$$ Amount → title → description → delivery → MINT
// ══════════════════════════════════════════════════════════════
function SellPage({navigate}){
  const[photos,setPhotos]=useState([]);
  const[amt,setAmt]=useState("");
  const[title,setTitle]=useState("");
  const[desc,setDesc]=useState("");
  const[delivery,setDelivery]=useState("");
  const[nftInfo,setNftInfo]=useState("");
  const[serial,setSerial]=useState("");
  const[step,setStep]=useState("form"); // form | minting | done
  const addPhoto=()=>setPhotos(p=>[...p,{id:Date.now(),bg:OG[p.length%OG.length]}]);
  const canMint=title&&amt;

  if(step==="minting") return (
    <div style={{background:C.navy,minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:24,padding:32}}>
      <TopBar back onBack={()=>setStep("form")}/>
      {/* Minting animation — wireframe shows Visby mark animating */}
      <div style={{animation:"pulse 1.2s ease-in-out infinite"}}>
        <Mark size={120}/>
      </div>
      <div style={{fontSize:26,fontWeight:700,color:"#fff",letterSpacing:"-0.02em"}}>minting…</div>
      <div style={{fontFamily:"'DM Mono',monospace",fontSize:12,color:C.muted,textAlign:"center",lineHeight:1.8}}>
        Recording provenance on Solana<br/>Do not close this page
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.6;transform:scale(.95)}}`}</style>
    </div>
  );

  if(step==="done") return (
    <div style={{background:C.navy,minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,padding:32}}>
      <div style={{width:64,height:64,borderRadius:"50%",background:C.teal,display:"flex",alignItems:"center",justifyContent:"center"}}>{Ic.check("#fff",26)}</div>
      <div style={{fontSize:22,fontWeight:800,color:"#fff"}}>Listed!</div>
      <div style={{fontSize:14,color:C.muted,textAlign:"center",lineHeight:1.8}}>Your item is live on Visby.<br/>NFT provenance minted on Solana.</div>
      <div style={{background:"rgba(255,255,255,.04)",borderRadius:14,padding:"14px 24px",border:"1px solid rgba(255,255,255,.08)",textAlign:"center",width:"100%",maxWidth:320}}>
        <div style={{fontSize:11,color:C.muted,fontFamily:"'DM Mono',monospace",marginBottom:4}}>SERIAL NUMBER</div>
        <div style={{fontSize:14,fontWeight:700,color:C.teal,fontFamily:"'DM Mono',monospace"}}>{serial||"VIS-"+Date.now().toString(36).toUpperCase()}</div>
        <div style={{fontSize:16,fontWeight:800,background:GH,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",marginTop:6}}>${Number(amt).toLocaleString()}</div>
      </div>
      <button onClick={()=>navigate("home")} style={{background:GH,border:"none",borderRadius:14,padding:"13px 40px",fontWeight:700,fontSize:15,color:"#fff",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>View Feed</button>
    </div>
  );

  return <div style={{background:C.navy,minHeight:"100vh"}}>
    <TopBar back onBack={()=>navigate("home")} title="List an Item"/>
    <div style={{maxWidth:600,margin:"0 auto",padding:"16px 14px 100px"}}>

      {/* PHOTO GRID — matches wireframe: large square + 3 smaller */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gridTemplateRows:"auto auto",gap:8,marginBottom:18}}>
        {/* Main large photo — spans 2 cols × 2 rows */}
        <div onClick={addPhoto} style={{gridColumn:"1/3",gridRow:"1/3",aspectRatio:"1",background:photos[0]?photos[0].bg:"rgba(255,255,255,.04)",border:`2px dashed ${photos[0]?"transparent":"rgba(255,255,255,.14)"}`,borderRadius:14,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,cursor:"pointer",transition:"all .2s",overflow:"hidden"}}
          onMouseEnter={e=>!photos[0]&&(e.currentTarget.style.borderColor=C.teal+"66")}
          onMouseLeave={e=>!photos[0]&&(e.currentTarget.style.borderColor="rgba(255,255,255,.14)")}>
          {photos[0]?<div style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:"rgba(255,255,255,.3)",textTransform:"uppercase"}}>Photo 1</div>:<>{Ic.cam(36)}<span style={{fontSize:12,color:C.muted}}>Add photos</span></>}
        </div>
        {/* Smaller thumbnails */}
        {[1,2,3].map(idx=>(
          <div key={idx} onClick={addPhoto} style={{aspectRatio:"1",background:photos[idx]?photos[idx].bg:"rgba(255,255,255,.04)",border:`2px dashed ${photos[idx]?"transparent":"rgba(255,255,255,.12)"}`,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:18,color:"rgba(255,255,255,.3)"}}>
            {photos[idx]?<span style={{fontSize:9,color:"rgba(255,255,255,.3)",fontFamily:"'DM Mono',monospace",textTransform:"uppercase"}}>Photo {idx+1}</span>:"+"}
          </div>
        ))}
      </div>

      {/* $$$ Amount field — matches wireframe "$ $ $ ... Amount" */}
      <div style={{marginBottom:12}}>
        <div style={{fontSize:11,color:C.muted,marginBottom:5,fontFamily:"'DM Mono',monospace",letterSpacing:"0.06em",textTransform:"uppercase"}}>$ $ $ … Amount</div>
        <div style={{position:"relative"}}>
          <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.teal,fontSize:16,fontWeight:700}}>$</span>
          <input value={amt} onChange={e=>setAmt(e.target.value)} placeholder="0.00" type="number"
            style={{width:"100%",background:"rgba(255,255,255,.05)",border:`1px solid rgba(255,255,255,.12)`,borderRadius:10,padding:"12px 12px 12px 28px",color:"#fff",fontSize:18,fontWeight:700,outline:"none",fontFamily:"'DM Sans',sans-serif"}}/>
        </div>
      </div>

      <Field label="" value={title} onChange={setTitle} placeholder="title…"/>
      <Field label="" value={desc} onChange={setDesc} placeholder="description…" multi/>

      {/* Delivery info — wireframe shows this as a taller field */}
      <div style={{marginBottom:12}}>
        <textarea value={delivery} onChange={e=>setDelivery(e.target.value)} placeholder="delivery info…" rows={3}
          style={{width:"100%",background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.1)",borderRadius:10,padding:"10px 12px",color:"#fff",fontSize:14,outline:"none",fontFamily:"'DM Sans',sans-serif",resize:"none"}}/>
      </div>

      {/* NFT info section — wireframe shows this with a toggle */}
      <div style={{background:"rgba(45,207,179,.06)",border:`1px solid ${C.teal}33`,borderRadius:14,padding:"12px 14px",marginBottom:18}}>
        <div style={{fontSize:13,fontWeight:700,color:C.teal,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>{Ic.nft(11)}NFT info</div>
        <Field label="" value={nftInfo} onChange={setNftInfo} placeholder="NFT details, collection, attributes…" multi/>
        <Field label="" value={serial} onChange={setSerial} placeholder="Serial number (auto-generated if blank)"/>
        <div style={{fontSize:11,color:C.muted,lineHeight:1.7}}>Tap on it to see drop-down options. First come first served on limited items.</div>
      </div>

      {/* MINT button — big, matches wireframe */}
      <button onClick={()=>{if(canMint){setStep("minting");setTimeout(()=>setStep("done"),2800);}}}
        style={{width:"100%",background:canMint?GH:"rgba(255,255,255,.08)",border:"none",borderRadius:16,padding:"18px 0",fontSize:22,fontWeight:800,color:canMint?"#fff":"rgba(255,255,255,.3)",cursor:canMint?"pointer":"not-allowed",fontFamily:"'DM Sans',sans-serif",letterSpacing:"-0.01em",transition:"all .2s"}}>
        Mint
      </button>
      {!canMint&&<div style={{textAlign:"center",fontSize:12,color:C.muted,marginTop:8}}>Add title and price to mint</div>}
    </div>
  </div>;
}

// ══════════════════════════════════════════════════════════════
// PAGE 4 — NOTIFICATIONS / MESSAGES (row1 screen4, row2 screen4)
// Tabbed: "message" | "notification"
// Messages: conversation list
// Notifications: heart / bookmark / $ / activity items
// ══════════════════════════════════════════════════════════════
function NotifPage(){
  const[tab,setTab]=useState("notifications");
  const notifs=[
    {type:"heart", icon:()=>Ic.heart(true,18),  color:C.red,   text:"sneaker.vault liked your listing",   sub:"Nike Air Max 1 '86 OG", time:"2m"},
    {type:"heart", icon:()=>Ic.heart(true,18),  color:C.red,   text:"watches.eth liked your item",        sub:"Rolex Sub", time:"14m"},
    {type:"bkmrk", icon:()=>Ic.bkmrk(true,18), color:C.teal,  text:"luxe.provenance saved your listing", sub:"Birkin 30", time:"1h"},
    {type:"dollar",icon:()=>Ic.dollar(18),      color:C.green, text:"New offer $11,500 on Rolex Sub",     sub:"from watches.eth", time:"2h"},
    {type:"dollar",icon:()=>Ic.dollar(18),      color:C.green, text:"Your Nike Air Max sold for $340",    sub:"Payment processing", time:"3h"},
    {type:"msg",   icon:()=>Ic.msg(true),       color:C.blue,  text:"sports.legacy sent you a message",   sub:"\"Is this still available?\"", time:"5h"},
  ];
  const messages=[
    {user:"sneaker.vault",msg:"Do you have size 10?",time:"2m",unread:true},
    {user:"watches.eth",msg:"Interested in a trade?",time:"1h",unread:true},
    {user:"sports.legacy",msg:"Is this still available?",time:"3h",unread:false},
    {user:"vintage.wear",msg:"Can you do $800?",time:"1d",unread:false},
    {user:"luxe.provenance",msg:"Just purchased! Thank you",time:"2d",unread:false},
  ];
  return <div style={{background:C.navy,minHeight:"100vh"}}>
    {/* Tab header */}
    <div style={{position:"sticky",top:0,zIndex:100,background:"rgba(14,20,32,.97)",backdropFilter:"blur(20px)",borderBottom:"1px solid rgba(255,255,255,.06)",padding:"12px 16px 0"}}>
      <div style={{display:"flex",gap:0,borderBottom:"1px solid rgba(255,255,255,.06)"}}>
        {["messages","notifications"].map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{flex:1,background:"none",border:"none",borderBottom:`2px solid ${tab===t?C.teal:"transparent"}`,padding:"10px 0",color:tab===t?C.teal:"rgba(255,255,255,.4)",fontSize:14,fontWeight:tab===t?700:400,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",textTransform:"capitalize",transition:"all .2s"}}>{t}</button>
        ))}
      </div>
    </div>

    <div style={{maxWidth:600,margin:"0 auto",paddingBottom:90}}>
      {tab==="notifications"&&notifs.map((n,i)=>(
        <div key={i} style={{display:"flex",gap:14,padding:"14px 16px",borderBottom:"1px solid rgba(255,255,255,.05)",animation:`fadeUp .3s ${i*.04}s ease both`,opacity:0}}>
          <div style={{width:38,height:38,borderRadius:"50%",background:`${n.color}18`,border:`1px solid ${n.color}33`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{n.icon()}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:600,color:"rgba(255,255,255,.85)",marginBottom:2}}>{n.text}</div>
            <div style={{fontSize:12,color:C.muted}}>{n.sub}</div>
          </div>
          <span style={{fontSize:11,color:C.muted,fontFamily:"'DM Mono',monospace",flexShrink:0}}>{n.time}m</span>
        </div>
      ))}

      {tab==="messages"&&messages.map((m,i)=>(
        <div key={i} style={{display:"flex",gap:12,padding:"14px 16px",borderBottom:"1px solid rgba(255,255,255,.05)",cursor:"pointer",animation:`fadeUp .3s ${i*.04}s ease both`,opacity:0}}
          onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,.02)"}
          onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
          <div style={{width:44,height:44,borderRadius:"50%",background:OG[i%OG.length],display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,color:"#fff",flexShrink:0,position:"relative"}}>
            {m.user[0].toUpperCase()}
            {m.unread&&<div style={{position:"absolute",top:0,right:0,width:12,height:12,borderRadius:"50%",background:C.teal,border:`2px solid ${C.navy}`}}/>}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:14,fontWeight:m.unread?700:500,color:"#fff",marginBottom:2}}>{m.user}</div>
            <div style={{fontSize:12,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.msg}</div>
          </div>
          <span style={{fontSize:11,color:C.muted,fontFamily:"'DM Mono',monospace",flexShrink:0}}>{m.time}</span>
        </div>
      ))}
    </div>
  </div>;
}

// ══════════════════════════════════════════════════════════════
// PAGE 5 — PROFILE (row1 screen5, row2 screen5)
// Large avatar + name + desc + tabs: selling/owned/posts/wallet/edit
// ══════════════════════════════════════════════════════════════
function ProfilePage({navigate}){
  const[tab,setTab]=useState("selling");
  const[editMode,setEditMode]=useState(false);
  const[name,setName]=useState("judah.miller");
  const[bio,setBio]=useState("Collector · NFT enthusiast");
  const tabs=["selling","owned","posts","wallet","edit"];

  return <div style={{background:C.navy,minHeight:"100vh"}}>
    <TopBar cart={0} onCart={()=>{}} right={<button onClick={()=>navigate("settings")} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,.5)",fontSize:12,fontFamily:"'DM Sans',sans-serif"}}>Settings</button>}/>

    <div style={{maxWidth:600,margin:"0 auto",paddingBottom:90}}>
      {/* Profile header — matches wireframe: large circle + name/desc right */}
      <div style={{padding:"20px 16px 0",display:"flex",gap:16,alignItems:"flex-start"}}>
        {/* Large avatar circle */}
        <div style={{position:"relative",flexShrink:0}}>
          <div style={{width:76,height:76,borderRadius:"50%",background:GD,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,fontWeight:800,color:"#fff",boxShadow:`0 0 0 3px ${C.navy},0 0 0 5px ${C.teal}`}}>J</div>
          <button style={{position:"absolute",bottom:0,right:0,width:22,height:22,borderRadius:"50%",background:GH,border:`2px solid ${C.navy}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>{Ic.plus(C.navy,10)}</button>
        </div>
        <div style={{flex:1}}>
          {editMode?<>
            <input value={name} onChange={e=>setName(e.target.value)} style={{background:"rgba(255,255,255,.06)",border:`1px solid ${C.teal}55`,borderRadius:8,padding:"6px 10px",color:"#fff",fontSize:16,fontWeight:700,outline:"none",fontFamily:"'DM Sans',sans-serif",width:"100%",marginBottom:6}}/>
            <textarea value={bio} onChange={e=>setBio(e.target.value)} rows={2} style={{background:"rgba(255,255,255,.06)",border:`1px solid ${C.teal}55`,borderRadius:8,padding:"6px 10px",color:"rgba(255,255,255,.7)",fontSize:12,outline:"none",fontFamily:"'DM Sans',sans-serif",width:"100%",resize:"none",marginBottom:6}}/>
            <button onClick={()=>setEditMode(false)} style={{background:GH,border:"none",borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:700,color:"#fff",cursor:"pointer"}}>Save</button>
          </>:<>
            <div style={{fontSize:19,fontWeight:800,color:"#fff",display:"flex",alignItems:"center",gap:7,marginBottom:3}}>{name}<div style={{width:15,height:15,borderRadius:"50%",background:C.teal,display:"flex",alignItems:"center",justifyContent:"center"}}>{Ic.check("#fff",9)}</div></div>
            <div style={{fontSize:12,color:C.muted,lineHeight:1.5,marginBottom:8}}>{bio}</div>
            <div style={{display:"flex",gap:16}}>{[["14","Listings"],["34","Sold"],["4.9★","Rating"]].map(([v,l])=><div key={l} style={{textAlign:"center"}}><div style={{fontSize:15,fontWeight:800,background:GH,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>{v}</div><div style={{fontSize:9,color:C.muted,fontFamily:"'DM Mono',monospace"}}>{l}</div></div>)}</div>
          </>}
        </div>
      </div>

      {/* TABS: selling / owned / posts / wallet / edit — from wireframe */}
      <div style={{display:"flex",padding:"16px 0 0",borderBottom:"1px solid rgba(255,255,255,.07)",overflowX:"auto",scrollbarWidth:"none"}}>
        {tabs.map(t=>(
          <button key={t} onClick={()=>{setTab(t);if(t==="edit")setEditMode(true);}} style={{flex:"0 0 auto",background:"none",border:"none",borderBottom:`2px solid ${tab===t?C.teal:"transparent"}`,padding:"10px 14px",color:tab===t?C.teal:"rgba(255,255,255,.4)",fontSize:12,fontWeight:tab===t?700:400,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",textTransform:"capitalize",whiteSpace:"nowrap",transition:"all .2s"}}>{t}</button>
        ))}
      </div>

      {/* Tab content */}
      {(tab==="selling"||tab==="owned"||tab==="posts")&&(
        <div style={{padding:"14px 14px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {ITEMS.slice(0,tab==="posts"?3:tab==="owned"?2:4).map((item,i)=>(
            <div key={item.id} style={{background:C.card,borderRadius:12,overflow:"hidden",border:`1px solid ${C.border}`,cursor:"pointer"}}>
              <div style={{background:item.bg,height:100,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"rgba(0,0,0,.2)",textTransform:"uppercase"}}>{item.category}</span></div>
              <div style={{padding:"8px 10px 10px"}}>
                <div style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:2,lineHeight:1.3}}>{item.name}</div>
                <span style={{fontSize:13,fontWeight:800,background:GH,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>${item.price.toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* WALLET TAB — from wireframe profile "wallet" tab */}
      {tab==="wallet"&&(
        <div style={{padding:"16px 14px"}}>
          <div style={{background:`linear-gradient(135deg,rgba(62,255,216,.08),rgba(199,66,255,.06))`,border:"1px solid rgba(62,255,216,.14)",borderRadius:18,padding:"20px",textAlign:"center",marginBottom:16}}>
            <div style={{fontSize:11,color:C.muted,fontFamily:"'DM Mono',monospace",marginBottom:6}}>VISBY BALANCE</div>
            <div style={{fontSize:36,fontWeight:800,background:GH,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",marginBottom:4}}>$2,340.50</div>
            <div style={{display:"flex",gap:10,justifyContent:"center",marginTop:14}}>
              {["Send","Receive","Swap","Add"].map(a=>(
                <div key={a} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5,cursor:"pointer"}}>
                  <div style={{width:40,height:40,borderRadius:"50%",background:GH,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>
                    {a==="Send"?"↑":a==="Receive"?"↓":a==="Swap"?"⇄":"+"}
                  </div>
                  <span style={{fontSize:10,color:"rgba(255,255,255,.5)",fontFamily:"'DM Mono',monospace"}}>{a}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{fontSize:12,color:C.muted,fontFamily:"'DM Mono',monospace",marginBottom:10}}>RECENT TRANSACTIONS</div>
          {[{t:"Sale: Nike Air Max",a:"+$340",c:C.green},{t:"Purchase: Levi's 501",a:"-$890",c:C.red},{t:"NFT Minted",a:"$0.00",c:C.teal}].map((tx,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"11px 0",borderBottom:"1px solid rgba(255,255,255,.05)"}}>
              <span style={{fontSize:13,color:"rgba(255,255,255,.7)"}}>{tx.t}</span>
              <span style={{fontSize:13,fontWeight:700,color:tx.c,fontFamily:"'DM Mono',monospace"}}>{tx.a}</span>
            </div>
          ))}
        </div>
      )}

      {/* NFT TAB content — matches row2 screen5 wireframe */}
      {tab==="NFTs"&&(
        <div style={{padding:"14px 14px"}}>
          <div style={{fontSize:11,color:C.muted,fontFamily:"'DM Mono',monospace",marginBottom:10}}>NFT PROVENANCE RECORDS</div>
          {ITEMS.slice(0,3).map((item,i)=>(
            <div key={item.id} style={{background:"rgba(255,255,255,.04)",borderRadius:12,padding:"12px 14px",marginBottom:8,border:"1px solid rgba(255,255,255,.07)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>{Ic.nft(10)}<span style={{fontSize:13,fontWeight:700,color:"#fff"}}>{item.name}</span></div>
                <div style={{fontSize:10,color:C.muted,fontFamily:"'DM Mono',monospace"}}>SN: {item.serial}</div>
              </div>
              <Ic.toggle v={i!==1} onClick={()=>{}}/>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>;
}

// ══════════════════════════════════════════════════════════════
// PAGE 6 — SETTINGS (row2, screen1)
// Menu list: Settings, Saved, Friends, Following, Payment, extras, Help
// ══════════════════════════════════════════════════════════════
function SettingsPage({navigate}){
  const menuItems=[
    {label:"Settings",sub:null},{label:"Saved",sub:"Bookmarked items"},
    {label:"Friends",sub:null},{label:"Following",sub:null,action:()=>navigate("following")},
    {label:"Payment",sub:"Cards, crypto, payouts"},
    {label:"Notifications",sub:null},{label:"Shipping Addresses",sub:null},
    {label:"Privacy",sub:null},{label:"NFT Wallet",sub:"Solana wallet"},
    {label:"Verification",sub:"Civic ID verify"},{label:"Brand Registry",sub:null},
    {label:"Help",sub:"FAQs and support"},
  ];
  const[notifs,setNotifs]=useState({sales:true,offers:true,shipping:true,news:false});

  return <div style={{background:C.navy,minHeight:"100vh"}}>
    <TopBar back onBack={()=>navigate("profile")} title="Settings"
      right={<div style={{display:"flex",gap:10}}>
        {[...Array(2)].map((_,i)=><div key={i} style={{width:32,height:32,borderRadius:"50%",background:OG[i],display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:"#fff"}}>J</div>)}
      </div>}/>

    <div style={{maxWidth:600,margin:"0 auto",padding:"14px 14px 90px"}}>
      {/* Profile row */}
      <div style={{background:"rgba(255,255,255,.04)",borderRadius:14,padding:"14px",display:"flex",alignItems:"center",gap:12,marginBottom:20,border:"1px solid rgba(255,255,255,.07)"}}>
        <div style={{width:48,height:48,borderRadius:"50%",background:GD,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,color:"#fff"}}>J</div>
        <div style={{flex:1}}>
          <div style={{fontSize:15,fontWeight:700,color:"#fff"}}>judah.miller</div>
          <div style={{fontSize:12,color:C.muted}}>judah@visby.io</div>
        </div>
        <button style={{background:GH,border:"none",borderRadius:9,padding:"7px 14px",fontSize:12,fontWeight:700,color:"#fff",cursor:"pointer"}}>Edit</button>
      </div>

      {/* Notification toggles */}
      <div style={{background:"rgba(255,255,255,.04)",borderRadius:14,padding:"12px 14px",marginBottom:14,border:"1px solid rgba(255,255,255,.07)"}}>
        <div style={{fontSize:12,fontWeight:700,color:"#fff",marginBottom:10}}>Notifications</div>
        {Object.entries(notifs).map(([k,v])=>(
          <div key={k} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,.04)"}}>
            <span style={{fontSize:13,color:"rgba(255,255,255,.7)",textTransform:"capitalize"}}>{k}</span>
            <Ic.toggle v={v} onClick={()=>setNotifs(p=>({...p,[k]:!p[k]}))}/>
          </div>
        ))}
      </div>

      {/* Menu list — matches wireframe */}
      <div style={{background:"rgba(255,255,255,.04)",borderRadius:14,overflow:"hidden",border:"1px solid rgba(255,255,255,.07)"}}>
        {menuItems.map((item,i)=>(
          <div key={i} onClick={item.action} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"13px 16px",borderBottom:i<menuItems.length-1?"1px solid rgba(255,255,255,.05)":"none",cursor:"pointer",transition:"background .15s"}}
            onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,.03)"}
            onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <div>
              <div style={{fontSize:14,color:item.label==="Help"?"rgba(255,255,255,.5)":"rgba(255,255,255,.85)"}}>{item.label}</div>
              {item.sub&&<div style={{fontSize:11,color:C.muted,marginTop:1}}>{item.sub}</div>}
            </div>
            <Ic.chevR/>
          </div>
        ))}
      </div>

      <button onClick={()=>navigate("home")} style={{width:"100%",marginTop:16,background:"rgba(255,59,92,.1)",border:"1px solid rgba(255,59,92,.3)",borderRadius:14,padding:"13px 0",fontSize:14,fontWeight:600,color:C.red,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>Sign Out</button>
    </div>
  </div>;
}

// ══════════════════════════════════════════════════════════════
// PAGE 7 — ITEM DETAIL (row2, screen2)
// Search + star ratings + photo + name + desc + NFT info toggle
// quick buy | Add to cart + "save to buy later"
// ══════════════════════════════════════════════════════════════
function DetailPage({item,navigate}){
  const[rating,setRating]=useState(0);
  const[liked,setLiked]=useState(false);
  const[saved,setSaved]=useState(false);
  const[nftOpen,setNftOpen]=useState(false);
  const[tab,setTab]=useState("info");
  const owners=[{name:item.brand,role:"Manufacturer",time:"Mar 2024",event:"Mint"},...(item.owners>1?[{name:"first.buyer",role:"First owner",time:"Jun 2024",event:"Purchase"}]:[]),...(item.owners>2?[{name:item.seller,role:"Current owner",time:"Jan 2025",event:"Purchase"}]:[])];

  return <div style={{background:C.navy,minHeight:"100vh"}}>
    {/* Top bar with search + stars — matches wireframe row2 screen2 */}
    <div style={{position:"sticky",top:0,zIndex:100,background:"rgba(14,20,32,.97)",backdropFilter:"blur(20px)",borderBottom:"1px solid rgba(255,255,255,.06)",padding:"10px 14px"}}>
      <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:8}}>
        <button onClick={()=>navigate("home")} style={{background:"none",border:"none",cursor:"pointer",padding:4}}>{Ic.back()}</button>
        <div style={{flex:1,background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.09)",borderRadius:10,padding:"8px 12px",color:"rgba(255,255,255,.35)",fontSize:13,fontFamily:"'DM Sans',sans-serif"}}>Search…</div>
        <button onClick={()=>setLiked(!liked)} style={{background:"none",border:"none",cursor:"pointer",padding:4}}>{Ic.heart(liked,20)}</button>
        <button onClick={()=>setSaved(!saved)} style={{background:"none",border:"none",cursor:"pointer",padding:4}}>{Ic.bkmrk(saved,20)}</button>
      </div>
      {/* Star rating row — "click the stars for review" from wireframe */}
      <div style={{display:"flex",alignItems:"center",gap:10,paddingLeft:34}}>
        <Stars r={rating||item.rating} s={14} interactive onRate={setRating}/>
        <span style={{fontSize:11,color:C.muted,fontFamily:"'DM Mono',monospace"}}>
          {rating?`You rated ${rating}★`:`(${item.reviews} reviews) · tap to rate`}
        </span>
        <span style={{marginLeft:"auto",fontSize:11,color:C.muted}}>{item.views.toLocaleString()} views</span>
      </div>
    </div>

    <div style={{maxWidth:600,margin:"0 auto",paddingBottom:110}}>
      {/* Photo area — large + small thumbnail, camera icon */}
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:8,padding:"12px 14px 0"}}>
        <div style={{background:item.bg,borderRadius:14,aspectRatio:"1",display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
          <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"rgba(0,0,0,.2)",textTransform:"uppercase"}}>{item.category}</span>
          <div style={{position:"absolute",bottom:10,left:10,display:"flex",alignItems:"center",gap:5,background:"rgba(255,255,255,.9)",borderRadius:12,padding:"4px 8px"}}>{Ic.nft(10)}<span style={{fontSize:9,color:C.teal,fontFamily:"'DM Mono',monospace",fontWeight:600}}>NFT</span></div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <div style={{background:item.bg+"88",borderRadius:10,flex:1,display:"flex",alignItems:"center",justifyContent:"center"}}>{Ic.cam(22)}</div>
          <div style={{background:"rgba(255,255,255,.04)",borderRadius:10,flex:1,display:"flex",alignItems:"center",justifyContent:"center",border:"1px dashed rgba(255,255,255,.12)",cursor:"pointer"}}><span style={{fontSize:18,color:"rgba(255,255,255,.2)"}}>+</span></div>
        </div>
      </div>

      <div style={{padding:"16px 14px 0"}}>
        {/* Name + price */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
          <div style={{flex:1}}>
            <div style={{fontSize:21,fontWeight:800,color:"#fff",marginBottom:3}}>{item.name}</div>
            <div style={{fontSize:11,color:C.muted,fontFamily:"'DM Mono',monospace"}}>SN: {item.serial}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:24,fontWeight:800,background:GH,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>${item.price.toLocaleString()}</div>
            {item.retail&&<div style={{fontSize:11,color:C.muted,textDecoration:"line-through",fontFamily:"'DM Mono',monospace"}}>${item.retail}</div>}
          </div>
        </div>

        {/* Tabs */}
        <div style={{display:"flex",borderBottom:"1px solid rgba(255,255,255,.07)",marginBottom:14}}>
          {["info","history","reviews"].map(t=><button key={t} onClick={()=>setTab(t)} style={{flex:1,background:"none",border:"none",borderBottom:`2px solid ${tab===t?C.teal:"transparent"}`,padding:"9px 0",color:tab===t?C.teal:"rgba(255,255,255,.4)",fontSize:12,fontWeight:tab===t?700:400,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",textTransform:"capitalize"}}>{t}</button>)}
        </div>

        {tab==="info"&&<div style={{fontSize:13,color:"rgba(255,255,255,.65)",lineHeight:1.8,marginBottom:14}}>{item.desc}</div>}
        {tab==="history"&&<div style={{marginBottom:14}}><OwnerDots count={item.owners}/><div style={{marginTop:14}}>{owners.map((o,i)=><div key={i} style={{display:"flex",gap:10,marginBottom:14}}><div style={{width:30,height:30,borderRadius:"50%",background:OG[i%OG.length],display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:"#fff",flexShrink:0}}>{o.name[0].toUpperCase()}</div><div><div style={{fontSize:13,fontWeight:600,color:"#fff"}}>{o.name}</div><div style={{fontSize:11,color:C.muted}}>{o.role} · {o.time}</div></div></div>)}</div></div>}
        {tab==="reviews"&&<div style={{marginBottom:14}}>{["Great item, fast ship!","NFT transferred instantly.","Exactly as described."].map((r,i)=><div key={i} style={{padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,.05)"}}><Stars r={5} s={11}/><div style={{fontSize:12,color:"rgba(255,255,255,.6)",marginTop:4,lineHeight:1.6}}>{r}</div></div>)}</div>}

        {/* NFT info section with toggle — "tap on it, see a drop-down" from wireframe */}
        <div style={{background:"rgba(45,207,179,.05)",border:`1px solid ${C.teal}33`,borderRadius:14,padding:"12px 14px",marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}} onClick={()=>setNftOpen(!nftOpen)}>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>{Ic.nft(11)}<span style={{fontSize:13,fontWeight:700,color:C.teal}}>NFT info</span></div>
            <span style={{color:C.teal,fontSize:12}}>{nftOpen?"▲":"▼"}</span>
          </div>
          {nftOpen&&<div style={{marginTop:10}}>
            {[["Blockchain","Solana (PoH)"],["Standard","Metaplex Core"],["Serial",item.serial],["Metadata","Arweave (permanent)"],["First come","First served"]].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,.05)"}}>
                <span style={{fontSize:12,color:C.muted}}>{k}</span>
                <span style={{fontSize:12,fontWeight:600,color:"#fff",fontFamily:"'DM Mono',monospace"}}>{v}</span>
              </div>
            ))}
          </div>}
        </div>

        {/* Quick buy | Add to cart — matches wireframe */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <button onClick={()=>navigate("checkout",item)} style={{background:GH,border:"none",borderRadius:12,padding:"14px 0",fontWeight:800,fontSize:15,color:"#fff",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>quick buy</button>
          <button style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)",borderRadius:12,padding:"14px 0",fontWeight:600,fontSize:14,color:"rgba(255,255,255,.8)",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>Add to cart</button>
        </div>
        {/* Save to buy later — from wireframe annotation */}
        <div style={{textAlign:"center",fontSize:12,color:C.muted,cursor:"pointer",textDecoration:"underline",textDecorationColor:"rgba(255,255,255,.2)"}}>save to buy later</div>
      </div>
    </div>
  </div>;
}

// ══════════════════════════════════════════════════════════════
// FOLLOWING PAGE
// ══════════════════════════════════════════════════════════════
function FollowingPage({navigate}){
  const[users,setUsers]=useState([
    {id:1,name:"sneaker.vault",desc:"Authenticated sneakers",verified:true,items:34,following:true},
    {id:2,name:"watches.eth",desc:"Luxury timepieces",verified:true,items:12,following:true},
    {id:3,name:"luxe.provenance",desc:"Hermès · Chanel · LV",verified:true,items:8,following:false},
    {id:4,name:"vintage.wear",desc:"Deadstock denim",verified:false,items:57,following:true},
    {id:5,name:"sports.legacy",desc:"Signed memorabilia",verified:true,items:23,following:false},
    {id:6,name:"gallery.nft",desc:"Fine art + NFTs",verified:true,items:16,following:true},
  ]);
  const tog=id=>setUsers(u=>u.map(x=>x.id===id?{...x,following:!x.following}:x));
  return <div style={{background:C.navy,minHeight:"100vh"}}>
    <TopBar back onBack={()=>navigate("settings")} title="Following"/>
    <div style={{maxWidth:600,margin:"0 auto",padding:"8px 14px 90px"}}>
      {users.map((u,i)=>(
        <div key={u.id} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 0",borderBottom:"1px solid rgba(255,255,255,.05)"}}>
          <div style={{width:44,height:44,borderRadius:"50%",background:OG[i%OG.length],display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,color:"#fff",flexShrink:0}}>{u.name[0].toUpperCase()}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:14,fontWeight:600,color:"#fff",display:"flex",alignItems:"center",gap:5}}>{u.name}{u.verified&&<div style={{width:13,height:13,borderRadius:"50%",background:C.teal,display:"flex",alignItems:"center",justifyContent:"center"}}>{Ic.check("#fff",7)}</div>}</div>
            <div style={{fontSize:12,color:C.muted}}>{u.desc} · {u.items} items</div>
          </div>
          <button onClick={()=>tog(u.id)} style={{background:u.following?GH:"rgba(255,255,255,.06)",border:`1px solid ${u.following?"transparent":"rgba(255,255,255,.12)"}`,borderRadius:10,padding:"7px 14px",fontWeight:600,fontSize:12,color:"#fff",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",transition:"all .2s"}}>{u.following?"Following":"Follow"}</button>
        </div>
      ))}
    </div>
  </div>;
}

// ── BOTTOM NAV (matches wireframe: home/search/+/bell/profile) ─
function BottomNav({tab,go,notifCount=3}){
  const tabs=[
    {id:"home",    label:"Home",   ico:a=>Ic.home(a)},
    {id:"explore", label:"Search", ico:a=>Ic.search(a)},
    {id:"sell",    label:"",       ico:null},
    {id:"notif",   label:"",      ico:a=>Ic.bell(a),badge:notifCount},
    {id:"profile", label:"Profile",ico:a=>Ic.user(a)},
  ];
  return <nav style={{position:"fixed",bottom:0,left:0,right:0,background:"rgba(14,20,32,.97)",backdropFilter:"blur(20px)",borderTop:"1px solid rgba(255,255,255,.06)",display:"flex",justifyContent:"space-around",padding:"10px 0 14px",zIndex:200}}>
    {tabs.map(t=>(
      <button key={t.id} onClick={()=>go(t.id)} style={{background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"0 10px",position:"relative"}}>
        {t.id==="sell"
          ?<div style={{width:46,height:46,borderRadius:"50%",border:`2px solid ${C.teal}`,background:"rgba(62,255,216,.08)",display:"flex",alignItems:"center",justifyContent:"center",marginTop:-20,boxShadow:`0 4px 20px rgba(62,255,216,.2)`}}>{Ic.plus(C.teal,22)}</div>
          :<div style={{position:"relative"}}>{t.ico(tab===t.id)}{t.badge>0&&<div style={{position:"absolute",top:-3,right:-3,width:14,height:14,borderRadius:"50%",background:C.red,fontSize:8,fontWeight:700,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center"}}>{t.badge}</div>}</div>}
        {t.label&&<span style={{fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:"0.05em",textTransform:"uppercase",color:tab===t.id?C.teal:"rgba(255,255,255,.3)",marginTop:t.id==="sell"?3:0}}>{t.label}</span>}
      </button>
    ))}
  </nav>;
}

// ── SIMPLE CHECKOUT ───────────────────────────────────────────
function CheckoutPage({item,onBack,onDone}){
  const[step,setStep]=useState("pay");
  if(step==="minting") return <div style={{background:C.navy,minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:20,padding:32}}><div style={{animation:"pulse 1.2s ease-in-out infinite"}}><Mark size={80}/></div><div style={{fontSize:20,fontWeight:700,color:"#fff"}}>minting…</div><style>{`@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.6;transform:scale(.95)}}`}</style></div>;
  if(step==="done") return <div style={{background:C.navy,minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14,padding:32}}><div style={{width:56,height:56,borderRadius:"50%",background:C.teal,display:"flex",alignItems:"center",justifyContent:"center"}}>{Ic.check("#fff",22)}</div><div style={{fontSize:20,fontWeight:800,color:"#fff"}}>Purchase Complete!</div><div style={{fontSize:13,color:C.muted,textAlign:"center",lineHeight:1.8}}>NFT minted to your wallet.<br/>SN: {item.serial}</div><button onClick={onDone} style={{background:GH,border:"none",borderRadius:14,padding:"12px 36px",fontWeight:700,fontSize:15,color:"#fff",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>Done</button></div>;
  return <div style={{background:C.navy,minHeight:"100vh"}}>
    <TopBar back onBack={onBack} title="Checkout"/>
    <div style={{maxWidth:600,margin:"0 auto",padding:"20px 14px 100px"}}>
      <div style={{background:C.card,borderRadius:14,padding:14,display:"flex",gap:12,marginBottom:20,border:`1px solid ${C.border}`}}>
        <div style={{width:70,height:70,borderRadius:10,background:item.bg,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:8,fontFamily:"'DM Mono',monospace",color:"rgba(0,0,0,.2)",textTransform:"uppercase"}}>{item.category}</span></div>
        <div style={{flex:1}}><div style={{fontSize:14,fontWeight:700,color:C.text}}>{item.name}</div><div style={{fontSize:11,color:C.muted,fontFamily:"'DM Mono',monospace",marginTop:3}}>SN: {item.serial}</div><div style={{fontSize:20,fontWeight:800,background:GH,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",marginTop:4}}>${item.price.toLocaleString()}</div></div>
      </div>
      <div style={{background:"rgba(45,207,179,.06)",border:`1px solid ${C.teal}33`,borderRadius:14,padding:"14px",marginBottom:16}}><div style={{fontSize:12,color:C.teal,fontFamily:"'DM Mono',monospace",marginBottom:6}}>VISBY BUYER PROTECTION</div><div style={{fontSize:12,color:C.muted,lineHeight:1.7}}>Full refund if item doesn't match. NFT held in escrow until you confirm receipt.</div></div>
      <button onClick={()=>{setStep("minting");setTimeout(()=>setStep("done"),2400);}} style={{width:"100%",background:GH,border:"none",borderRadius:50,padding:"15px",fontWeight:700,fontSize:15,color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontFamily:"'DM Sans',sans-serif"}}><Mark size={20}/>Pay ${item.price.toLocaleString()} with VisbyPay</button>
    </div>
  </div>;
}

// ── ROOT ──────────────────────────────────────────────────────
export default function App(){
  const[page,setPage]=useState("home");
  const[detail,setDetail]=useState(null);
  const[tab,setTab]=useState("home");
  const[cart,setCart]=useState([]);
  const addCart=id=>setCart(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);

  const navigate=(p,data=null)=>{
    if((p==="detail"||p==="checkout")&&data){setDetail(data);setPage(p);}
    else{setPage(p);if(["home","explore","sell","notif","profile"].includes(p))setTab(p);}
  };

  const showNav=!["detail","sell","following","settings","checkout"].includes(page);

  return <div style={{fontFamily:"'DM Sans',sans-serif",maxWidth:600,margin:"0 auto",position:"relative"}}>
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@300;400;500&display=swap');
      *{box-sizing:border-box;margin:0;padding:0;}
      @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
      ::-webkit-scrollbar{display:none;}
      textarea,input{color:#fff;background:transparent;}
      input::placeholder,textarea::placeholder{color:rgba(255,255,255,.25);}
      select option{background:#1a2236;}
    `}</style>

    {page==="home"      &&<HomePage navigate={navigate} cart={cart.length} addCart={addCart}/>}
    {page==="explore"   &&<ExplorePage navigate={navigate}/>}
    {page==="sell"      &&<SellPage navigate={navigate}/>}
    {page==="notif"     &&<NotifPage/>}
    {page==="profile"   &&<ProfilePage navigate={navigate}/>}
    {page==="settings"  &&<SettingsPage navigate={navigate}/>}
    {page==="following" &&<FollowingPage navigate={navigate}/>}
    {page==="detail"    &&detail&&<DetailPage item={detail} navigate={navigate}/>}
    {page==="checkout"  &&detail&&<CheckoutPage item={detail} onBack={()=>navigate("home")} onDone={()=>navigate("home")}/>}

    {showNav&&<BottomNav tab={tab} go={navigate} notifCount={cart.length+2}/>}
  </div>;
}
