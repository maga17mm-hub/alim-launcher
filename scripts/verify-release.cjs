const crypto=require('node:crypto');
async function main(){
 const tag=process.argv[2];if(!/^v\d+\.\d+\.\d+$/.test(tag||''))throw new Error('Use: node scripts/verify-release.cjs vX.Y.Z');
 const repo='maga17mm-hub/alim-launcher';const headers={'User-Agent':'AlimLauncher-Release-Verification','Accept':'application/vnd.github+json'};if(process.env.GH_TOKEN)headers.Authorization='Bearer '+process.env.GH_TOKEN;
 const response=await fetch(`https://api.github.com/repos/${repo}/releases/tags/${tag}`,{headers});if(!response.ok)throw new Error('Release API HTTP '+response.status);const release=await response.json();if(release.draft||release.prerelease)throw new Error('A stable public release is required');
 const expected=[`Alim-Launcher-Setup-${tag.slice(1)}.exe`,`Alim-Launcher-Setup-${tag.slice(1)}.exe.blockmap`,'latest.yml'];
 const assets=expected.map(name=>{const asset=release.assets.find(a=>a.name===name&&a.state==='uploaded'&&a.size>0);if(!asset)throw new Error('Missing uploaded asset: '+name);return asset;});
 const metadata=await fetch(assets[2].browser_download_url);if(!metadata.ok)throw new Error('Public metadata HTTP '+metadata.status);const yaml=await metadata.text();if(!yaml.includes(`version: ${tag.slice(1)}`)||!yaml.includes(expected[0]))throw new Error('Metadata names another release');const hash=/sha512:\s*([A-Za-z0-9+/=]+)/.exec(yaml)?.[1];if(!hash)throw new Error('SHA-512 is missing');
 const binary=await fetch(assets[0].browser_download_url);if(!binary.ok||!binary.body)throw new Error('Public installer HTTP '+binary.status);const digest=crypto.createHash('sha512');let size=0;for await(const chunk of binary.body){digest.update(chunk);size+=chunk.length;}if(size!==assets[0].size||digest.digest('base64')!==hash)throw new Error('Public EXE does not match latest.yml');console.log(JSON.stringify({tag,public:true,assets:expected,size,sha512Verified:true}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
