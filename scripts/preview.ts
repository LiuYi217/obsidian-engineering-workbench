import { renderWorkbench, type UIState, type TabId } from '../src/ui';
import { createDemoData } from '../src/demo';
import { DEFAULT_SETTINGS } from '../src/domain';
const container=document.getElementById('app')!;
const state:UIState={data:createDemoData('2026-10-01'),settings:DEFAULT_SETTINGS,period:{start:'2026-09-28',end:'2026-10-04'},today:'2026-10-01',tab:'home',search:'',project:'',warnings:[]};
const params=new URLSearchParams(location.search);if(['home','projects','people','coordination','weekly'].includes(params.get('tab')||''))state.tab=params.get('tab') as TabId;
function render(){renderWorkbench(container,state,{tab:id=>{state.tab=id;history.replaceState(null,'',`?tab=${id}`);render()},search:value=>{state.search=value;render()},project:value=>{state.project=value;render()},period:p=>{state.period=p;render()},task:task=>{document.getElementById('detail')?.remove();const dialog=document.createElement('dialog');dialog.id='detail';const heading=document.createElement('h2');heading.textContent=task.title;const text=document.createElement('pre');text.textContent=JSON.stringify(task,null,2);const close=document.createElement('button');close.textContent='关闭';close.onclick=()=>dialog.close();dialog.append(heading,text,close);document.body.append(dialog);dialog.showModal();},open:()=>{},create:()=>{},createRecord:()=>{},import:()=>{},progress:()=>{},summary:()=>{},baseline:()=>{},chooseBaseline:id=>{state.baselineId=id;render()},demo:()=>{},refresh:render,settings:()=>{}});}
render();
