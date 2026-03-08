The instruction of the API and product is in the page:
https://convergence2026-token-api.cldev.cloud/docs

The Demo is in the page:
https://convergence2026-token-api.cldev.cloud/

## Private prediction market

1. **Deposit to vault** (on-chain), then **private-transfer** to the pool address so the pool holds your stake.
2. Run **private-prediction** to record your prediction off-chain (set `MARKET_ADDRESS`, `MARSHMALLOW_BACKEND_URL`):
   ```bash
   npx tsx src/private-prediction.ts <marketId> Yes|No <amountWei>
   ```
3. When the market settles, the backend credits winners via private-transfer (pool → winner). **Withdraw** via the usual `/withdraw` + redeem ticket on vault.