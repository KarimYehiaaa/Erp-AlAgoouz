import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import { listPurchaseInvoices } from './src/services/purchaseService.ts';

dotenv.config();

const localPgFile = './.postgres.local';
if (!process.env.POSTGRES_PASSWORD && fs.existsSync(localPgFile)) {
  process.env.POSTGRES_PASSWORD = fs.readFileSync(localPgFile, 'utf8').trim();
}

async function testQuery() {
  // Test June
  const june = await listPurchaseInvoices({
    from_date: '2026-06-01',
    to_date: '2026-06-30',
  });
  console.log(`June listPurchaseInvoices count: ${june.length}`);
  
  // Test July
  const july = await listPurchaseInvoices({
    from_date: '2026-07-01',
    to_date: '2026-07-31',
  });
  console.log(`July listPurchaseInvoices count: ${july.length}`);
  if (july.length > 0) {
    console.log('Sample July invoice date:', july[0].invoice_date);
  }
}

testQuery().catch(console.error);
