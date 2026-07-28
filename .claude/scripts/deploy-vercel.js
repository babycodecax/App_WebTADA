#!/usr/bin/env node
/** deploy-vercel.js — tu dong copy frontend + push len Vercel */
var fs=require('fs'),path=require('path'),execSync=require('child_process').execSync;
var ROOT=path.resolve(__dirname,'../..');
var SRC=path.join(ROOT,'backend/static');
var DST=path.join(ROOT,'api/public');
function cpDir(s,d){
  if(!fs.existsSync(d)) fs.mkdirSync(d,{recursive:true});
  fs.readdirSync(s).forEach(function(f){
    var sp=path.join(s,f),dp=path.join(d,f);
    if(fs.statSync(sp).isDirectory()) cpDir(sp,dp);
    else fs.copyFileSync(sp,dp);
  });
}
cpDir(SRC,DST);
['index.html','blog.html','admin.html'].forEach(function(f){
  var fp=path.join(DST,f);if(!fs.existsSync(fp))return;
  var c=fs.readFileSync(fp,'utf-8');c=c.replace(/static\//g,'');
  fs.writeFileSync(fp,c,'utf-8');
});
execSync('git add -A api/',{cwd:ROOT});
try{execSync('git diff --cached --quiet',{cwd:ROOT});console.log('Nothing to commit.');}
catch(e){execSync('git commit -m "deploy: sync frontend from local"',{cwd:ROOT});execSync('git push origin main',{cwd:ROOT});console.log('Deployed!');}
