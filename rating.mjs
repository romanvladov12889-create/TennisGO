// Tennis GO: each confirmed win adds 50; each confirmed loss subtracts 50.
export const initialRating=()=>({rating:1000,rd:350,volatility:0.06,matches:0,wins:0,losses:0});
export function updateRating(player,_opponent,score){
  if(score!==0&&score!==1)throw new RangeError('Результат должен быть победой или поражением');
  return {...player,rating:player.rating+(score===1?50:-50),matches:player.matches+1,wins:player.wins+(score===1?1:0),losses:player.losses+(score===0?1:0)};
}
