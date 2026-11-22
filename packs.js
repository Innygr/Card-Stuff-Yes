"use strict";
const statusEl=document.getElementById("status");
const listEl=document.getElementById("pack-list");
const revealEl=document.getElementById("reveal");
const resultsEl=document.getElementById("card-results");
const closeReveal=document.getElementById("close-reveal");
function status(message,error=false){statusEl.textContent=message;statusEl.classList.toggle("error",error);}
function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
function renderPacks(packs){
 listEl.replaceChildren();
 if(!packs.length){status("You don't have any unopened packs yet.");return;}
 status("You have "+packs.reduce((sum,p)=>sum+p.quantity,0)+" unopened pack(s).");
 for(const pack of packs){
  const card=element("article","pack-card");
  card.append(element("div","pack-icon","✦"));
  card.append(element("h2","",pack.name));
  card.append(element("p","",pack.description||"Open this pack to discover cards."));
  const meta=element("div","pack-meta");meta.append(element("span","",pack.cardsPerOpen+" cards per opening"),element("strong","", "Owned: "+pack.quantity));card.append(meta);
  const button=element("button","primary-button", "Open pack");
  button.type="button";button.disabled=pack.quantity<1;
  button.addEventListener("click",()=>openPack(pack,button));
  card.append(button);listEl.append(card);
 }
}
function renderResults(pack,cards){
 document.getElementById("reveal-title").textContent=pack.name+" opened!";
 document.getElementById("reveal-subtitle").textContent="These cards have been added to your collection.";
 resultsEl.replaceChildren();
 for(const card of cards){
  const tile=element("article","revealed-card");
  tile.append(element("div","symbol",card.symbol||"✦"));
  tile.append(element("h3","",card.name));
  tile.append(element("p","",card.description||""));
  tile.append(element("span","tag",(card.rarity||"Common")+" · "+(card.resource||"Astral Magik")));
  resultsEl.append(tile);
 }
 revealEl.classList.remove("hidden");
 revealEl.scrollIntoView({behavior:"smooth",block:"start"});
}
async function openPack(pack,button){
 button.disabled=true;button.textContent="Opening…";status("Opening "+pack.name+"…");
 try{
  const requestId=crypto.randomUUID();
  const result=await CSY_API.post("/api/account/packs/open",{packId:pack.id,requestId});
  renderResults(pack,result.cards||[]);
  status("Pack opened successfully. Remaining: "+result.remaining);
  await loadPacks();
 }catch(error){status(error.message,error.status!==401);button.disabled=false;button.textContent="Open pack";}
}
async function loadPacks(){
 try{const data=await CSY_API.get("/api/account/packs");renderPacks(data.packs||[]);}
 catch(error){if(error.status===401){status("Please sign in to open your packs.");setTimeout(()=>location.href="./login.html",900);}else status(error.message,true);}
}
closeReveal.addEventListener("click",()=>{revealEl.classList.add("hidden");listEl.scrollIntoView({behavior:"smooth"});});
loadPacks();
