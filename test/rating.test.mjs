import test from 'node:test';
import assert from 'node:assert/strict';
import {initialRating,updateRating} from '../rating.mjs';

test('a confirmed singles result changes both ratings without changing NTRP',()=>{
 const initial=initialRating(),winner=updateRating(initial,initial,1),loser=updateRating(initial,initial,0);
 assert.equal(initial.rating,1500);
 assert.ok(winner.rating>1500&&loser.rating<1500);
 assert.equal(winner.matches,1);assert.equal(winner.wins,1);
 assert.equal(loser.matches,1);assert.equal(loser.losses,1);
 assert.ok(winner.rd<initial.rd&&loser.rd<initial.rd);
 assert.ok(Math.abs(winner.rating+loser.rating-3000)<1);
});
