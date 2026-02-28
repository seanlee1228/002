import { chromium } from 'playwright';

async function testCardButtons() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15'
  });
  
  const page = await context.newPage();
  
  try {
    // Login first
    console.log('🔐 Logging in...');
    await page.goto('http://localhost:3000/login');
    await page.fill('input[name="username"], input[id*="username"], input[type="text"]', 'admin');
    await page.fill('input[name="password"], input[id*="password"], input[type="password"]', '123456');
    await page.click('button[type="submit"], button:has-text("登录"), button:has-text("Login")');
    await page.waitForLoadState('networkidle');
    
    // Step 1: Navigate to scoring page
    console.log('📱 Step 1: Navigating to /scoring...');
    await page.goto('http://localhost:3000/scoring');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'screenshots/test-01-scoring-page.png', fullPage: true });
    console.log('✅ Screenshot: test-01-scoring-page.png');
    
    // Step 2: Click on first class card
    console.log('📱 Step 2: Clicking first class card...');
    // Try multiple selectors to find the class card
    const classCard = await page.locator('text=1年级1班').first();
    await classCard.click();
    await page.waitForTimeout(1000); // Wait for form to appear
    await page.screenshot({ path: 'screenshots/test-02-scoring-form-opened.png', fullPage: true });
    console.log('✅ Screenshot: test-02-scoring-form-opened.png');
    
    // Step 3: Find and click "不达标" button for first check item
    console.log('📱 Step 3: Clicking 不达标 button...');
    const buDaBiaoButton = await page.locator('button:has-text("不达标"), button:has-text("✗")').first();
    await buDaBiaoButton.click();
    await page.waitForTimeout(500); // Wait for severity options to appear
    await page.screenshot({ path: 'screenshots/test-03-severity-cards-visible.png', fullPage: true });
    console.log('✅ Screenshot: test-03-severity-cards-visible.png');
    
    // Step 4: Navigate to weekly review
    console.log('📱 Step 4: Navigating to /weekly-review...');
    await page.goto('http://localhost:3000/weekly-review');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'screenshots/test-04-weekly-review-page.png', fullPage: true });
    console.log('✅ Screenshot: test-04-weekly-review-page.png');
    
    // Step 5: Click on first class card
    console.log('📱 Step 5: Clicking first class card...');
    const weeklyClassCard = await page.locator('text=1年级1班').first();
    await weeklyClassCard.click();
    await page.waitForTimeout(1000); // Wait for form to appear
    await page.screenshot({ path: 'screenshots/test-05-weekly-form-opened.png', fullPage: true });
    console.log('✅ Screenshot: test-05-weekly-form-opened.png');
    
    // Scroll down to see W-5 options
    console.log('📱 Step 6: Scrolling to see all weekly options...');
    await page.evaluate(() => window.scrollBy(0, 300));
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'screenshots/test-06-weekly-form-scrolled.png', fullPage: true });
    console.log('✅ Screenshot: test-06-weekly-form-scrolled.png');
    
    console.log('\n🎉 All test screenshots captured!');
    console.log('📁 Check the screenshots/ folder for card button tests');
    
  } catch (error) {
    console.error('❌ Error:', error);
    await page.screenshot({ path: 'screenshots/test-error.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

testCardButtons();
