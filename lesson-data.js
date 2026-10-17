import {episodes} from './course.js';
export let lines,parts,scene,packs;
export function selectLesson(number){
 const lesson=Object.hasOwn(episodes,number)?episodes[number]:null;
 if(!lesson)throw new Error('This episode is not available.');
 ({lines,parts,scene,packs}=lesson);
}
selectLesson(1);
