"use strict";
const cardsEl=document.getElementById("cards"),statusEl=document.getElementById("status");
let catalogue=[];
function render(){
 const query=document.getElementById("search").value.trim().toLowerCase();
 const resource=document.getElementById("resource-filter").value;
 const ownership=document.getElementById("ownership-filter").value;
 const shown=catalogue.filter(card=>(!query||(card.name+" "+card.description+" "+card.id).toLowerCase().includes(query))&&(!resource||card.resource===resource)&&(ownership==="all"||(ownership==="owned"?card.quantity>0:card.quantity===0)));
 cardsEl.replaceChildren();
 for(const card of shown){
  const tile=document.createElement("article");tile.className="card"+(card.quantity?"":" not-owned");
  const symbol=document.createElement("div");symbol.className="symbol";symbol.textContent=card.symbol||"✦";
  const name=document.createElement("h2");name.textContent=card.name;
  const description=document.createElement("p");description.textContent=card.description||"";
  const meta=document.createElement("div");meta.className="meta";
  const affinity=document.createElement("span");affinity.textContent=card.resource||"Astral Magik";
  const qty=document.createElement("span");qty.className="quantity";qty.textContent="×"+card.quantity;
  meta.append(affinity,qty);tile.append(symbol,name,description,meta);cardsEl.append(tile);
 }
 statusEl.textContent=shown.length+" card(s) shown.";
}
async function load(){
 try{const data=await CSY_API.get("/api/account/collection");catalogue=data.cards||[];document.getElementById("owned-count").textContent=(data.ownedCount||0)+" owned";document.getElementById("total-count").textContent="of "+(data.count||catalogue.length)+" cards";render();}
 catch(error){statusEl.textContent=error.status===401?"Please sign in to view your collection.":error.message;statusEl.classList.add("error");if(error.status===401)setTimeout(()=>location.href="./login.html",900);}
}
for(const id of ["search","resource-filter","ownership-filter"])document.getElementById(id).addEventListener(id==="search"?"input":"change",render);
load();
