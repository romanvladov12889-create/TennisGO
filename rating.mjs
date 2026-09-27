// Glicko-2, one confirmed singles match per rating period.
const SCALE=173.7178;
export const initialRating=()=>({rating:1500,rd:350,volatility:0.06,matches:0,wins:0,losses:0});
export function updateRating(player,opponent,score){
  const mu=(player.rating-1500)/SCALE,phi=player.rd/SCALE;
  const otherMu=(opponent.rating-1500)/SCALE,otherPhi=opponent.rd/SCALE;
  const g=1/Math.sqrt(1+3*otherPhi**2/Math.PI**2);
  const expected=1/(1+Math.exp(-g*(mu-otherMu)));
  const variance=1/(g*g*expected*(1-expected));
  const delta=variance*g*(score-expected),a=Math.log(player.volatility**2),tau=0.5;
  const f=x=>{const e=Math.exp(x);return e*(delta*delta-phi*phi-variance-e)/(2*(phi*phi+variance+e)**2)-(x-a)/(tau*tau);};
  let A=a,B;
  if(delta*delta>phi*phi+variance)B=Math.log(delta*delta-phi*phi-variance);
  else{let k=1;while(f(a-k*tau)<0&&k<100)k++;B=a-k*tau;}
  let fA=f(A),fB=f(B);
  for(let i=0;i<100&&Math.abs(B-A)>1e-6;i++){
    const C=A+(A-B)*fA/(fB-fA),fC=f(C);
    if(fC*fB<=0){A=B;fA=fB;}else fA/=2;
    B=C;fB=fC;
  }
  const volatility=Math.exp(A/2),phiStar=Math.sqrt(phi*phi+volatility*volatility);
  const newPhi=1/Math.sqrt(1/(phiStar*phiStar)+1/variance);
  return {rating:Math.round((1500+SCALE*(mu+newPhi*newPhi*g*(score-expected)))*10)/10,
    rd:Math.round(Math.min(350,SCALE*newPhi)*10)/10,volatility,
    matches:player.matches+1,wins:player.wins+(score===1?1:0),losses:player.losses+(score===0?1:0)};
}
