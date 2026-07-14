const c=document.getElementById('game');
const ctx=c.getContext('2d');
document.getElementById('play').onclick=()=>{menu.hidden=true;c.hidden=false;requestAnimationFrame(loop);}
const menu=document.getElementById('menu');
let p={x:90,y:300,w:40,h:40,vy:0};
let bones=[{x:500,y:300}],rocks=[{x:750,y:315,w:30,h:25}],score=0;
function loop(){
ctx.clearRect(0,0,900,420);
ctx.fillStyle='#6b4';ctx.fillRect(0,340,900,80);
p.vy+=0.8;p.y+=p.vy;if(p.y>300){p.y=300;p.vy=0;}
ctx.fillStyle='#f5a623';ctx.beginPath();ctx.arc(p.x+20,p.y+20,20,0,Math.PI*2);ctx.fill();
ctx.fillStyle='#fff';ctx.font='20px Arial';ctx.fillText('Score: '+score,20,30);
bones.forEach(b=>{b.x-=4;ctx.fillStyle='white';ctx.beginPath();ctx.arc(b.x,b.y,8,0,6.28);ctx.fill();
if(Math.abs(b.x-(p.x+20))<20&&Math.abs(b.y-(p.y+20))<20){score+=10;b.x=950;}});
rocks.forEach(r=>{r.x-=4;ctx.fillStyle='#555';ctx.fillRect(r.x,r.y,r.w,r.h);
if(r.x<p.x+p.w&&r.x+r.w>p.x&&r.y<p.y+p.h&&r.y+r.h>p.y){ctx.fillStyle='red';ctx.font='40px Arial';ctx.fillText('GAME OVER',300,150);return;}});
requestAnimationFrame(loop);}
addEventListener('pointerdown',()=>{if(!c.hidden&&p.y>=300)p.vy=-14;});
