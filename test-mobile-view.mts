import { chromium } from 'playwright';

async function testMobileView() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15'
  });
  
  const page = await context.newPage();
  
  try {
    // Step 1: Navigate to login page
    console.log('📱 Step 1: Navigating to login page...');
    await page.goto('http://localhost:3000/login');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'screenshots/mobile-01-login.png', fullPage: true });
    console.log('✅ Screenshot saved: mobile-01-login.png');
    
    // Step 2: Fill in login credentials
    console.log('📱 Step 2: Filling in credentials...');
    await page.fill('input[name="username"], input[id*="username"], input[type="text"]', 'admin');
    await page.fill('input[name="password"], input[id*="password"], input[type="password"]', '123456');
    await page.screenshot({ path: 'screenshots/mobile-02-login-filled.png', fullPage: true });
    console.log('✅ Screenshot saved: mobile-02-login-filled.png');
    
    // Step 3: Click login button
    console.log('📱 Step 3: Clicking login button...');
    await page.click('button[type="submit"], button:has-text("登录"), button:has-text("Login")');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'screenshots/mobile-03-dashboard.png', fullPage: true });
    console.log('✅ Screenshot saved: mobile-03-dashboard.png');
    
    // Step 4: Navigate to scoring page
    console.log('📱 Step 4: Navigating to /scoring...');
    await page.goto('http://localhost:3000/scoring');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'screenshots/mobile-04-scoring.png', fullPage: true });
    console.log('✅ Screenshot saved: mobile-04-scoring.png');
    
    // Step 5: Navigate to weekly-review page
    console.log('📱 Step 5: Navigating to /weekly-review...');
    await page.goto('http://localhost:3000/weekly-review');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'screenshots/mobile-05-weekly-review.png', fullPage: true });
    console.log('✅ Screenshot saved: mobile-05-weekly-review.png');
    
    console.log('\n🎉 All screenshots captured successfully!');
    console.log('📁 Check the screenshots/ folder for results');
    
  } catch (error) {
    console.error('❌ Error:', error);
    await page.screenshot({ path: 'screenshots/mobile-error.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

testMobileView();
