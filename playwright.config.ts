import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser', fullyParallel:true, retries:process.env.CI?1:0, reporter:[['list'],['html',{open:'never'}]],
  use:{baseURL:'http://127.0.0.1:4173',screenshot:'only-on-failure',trace:'retain-on-failure'},
  webServer:{command:'npm run preview:build && node scripts/preview-server.mjs',url:'http://127.0.0.1:4173',reuseExistingServer:!process.env.CI},
  projects:[{name:'desktop',use:{viewport:{width:1440,height:1050}}},{name:'mobile',use:{viewport:{width:390,height:844}}}]
});
