import { produceRecipeBatch } from '../src/services/recipesService.js';

(async () => {
    try {
        console.log('Running test production (recipeId=1, qty=1, warehouseId=1, userId=1)');
        const res = await produceRecipeBatch({ recipeId: 1, quantity: 1, warehouseId: 1, notes: 'Test produce script', mode: 'production' }, 1);
        console.log('Produce test result:');
        console.dir(res, { depth: null });
    } catch (e) {
        console.error('Produce test failed:', e.message || e);
        if (e.stack) console.error(e.stack);
        process.exitCode = 1;
    }
})();
