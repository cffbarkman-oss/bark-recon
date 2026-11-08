/**
 * Captured provider payloads (mainnet, 2026-11-08).
 * Generated from live responses - do not hand-edit.
 */

export const JUPITER_V2_ORDER = {
  "swapType": "aggregator",
  "inAmount": "1000000",
  "outAmount": "3219646412",
  "otherAmountThreshold": "3203548179",
  "swapMode": "ExactIn",
  "slippageBps": 50,
  "priceImpactPct": "-0.0007631565356189989",
  "routePlan": [
    {
      "percent": 3.44,
      "bps": 344,
      "usdValue": 0.003071628461093724,
      "swapInfo": {
        "ammKey": "G3rceWMaDfkaekf2VL7BtKEY4YiujjiM5J1nKCMzMEBG",
        "label": "Whirlpool",
        "inputMint": "So11111111111111111111111111111111111111112",
        "outputMint": "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL",
        "inAmount": "34373",
        "outAmount": "9390705"
      }
    },
    {
      "percent": 100,
      "bps": 10000,
      "usdValue": 0.003071628461093724,
      "swapInfo": {
        "ammKey": "BgifL1GjU4zTpFfDmfUPDAsx3upTdDAwa1D4d8tWnhZN",
        "label": "Whirlpool",
        "inputMint": "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL",
        "outputMint": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
        "inAmount": "9390705",
        "outAmount": "110851393"
      }
    },
    {
      "percent": 96.56,
      "bps": 9656,
      "usdValue": 0.08621989657070057,
      "swapInfo": {
        "ammKey": "5zpyutJu9ee6jFymDGoK7F6S5Kczqtc9FomP3ueKuyA9",
        "label": "Whirlpool",
        "inputMint": "So11111111111111111111111111111111111111112",
        "outputMint": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
        "inAmount": "965627",
        "outAmount": "3112017888"
      }
    }
  ],
  "feeMint": "So11111111111111111111111111111111111111112",
  "feeBps": 10,
  "platformFee": {
    "feeBps": 10,
    "feeMint": "So11111111111111111111111111111111111111112"
  },
  "taker": "HMjMJZsQp6ykQyNSk8ZdmcJnNg5w9tRdU3q1DG3sW4ag",
  "gasless": false,
  "jitOptimized": false,
  "signatureFeeLamports": 5000,
  "signatureFeePayer": "HMjMJZsQp6ykQyNSk8ZdmcJnNg5w9tRdU3q1DG3sW4ag",
  "prioritizationFeeLamports": 185,
  "prioritizationFeePayer": "HMjMJZsQp6ykQyNSk8ZdmcJnNg5w9tRdU3q1DG3sW4ag",
  "rentFeeLamports": 2976880,
  "rentFeePayer": "HMjMJZsQp6ykQyNSk8ZdmcJnNg5w9tRdU3q1DG3sW4ag",
  "transaction": "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
  "lastValidBlockHeight": "445065477",
  "inputMint": "So11111111111111111111111111111111111111112",
  "outputMint": "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  "router": "metis",
  "guaranteedPrice": false,
  "requestId": "fixture-request-id",
  "inUsdValue": 0.0892915250317943,
  "outUsdValue": 0.0892233816208909,
  "swapUsdValue": 0.0892915250317943,
  "priceImpact": -0.07631565356189988,
  "mode": "ultra",
  "transactionVersion": 0,
  "totalTime": 80
} as const;

export const GOPLUS_TOKEN_SECURITY = {
  "code": 1,
  "result": {
    "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": {
      "balance_mutable_authority": {
        "authority": [],
        "status": "0"
      },
      "closable": {
        "authority": [],
        "status": "0"
      },
      "creators": [],
      "default_account_state": "1",
      "default_account_state_upgradable": {
        "authority": [],
        "status": "0"
      },
      "dex": [
        {
          "burn_percent": null,
          "day": {
            "price_max": "-1",
            "price_min": "-1",
            "volume": "70088.060741816300"
          },
          "dex_name": "orca",
          "fee_rate": "0.0005",
          "id": "5zpyutJu9ee6jFymDGoK7F6S5Kczqtc9FomP3ueKuyA9",
          "lp_amount": null,
          "month": {
            "price_max": "-1",
            "price_min": "-1",
            "volume": "10664807.83312350"
          },
          "open_time": "0",
          "price": "32127616.361749231742",
          "tvl": "275942.03",
          "type": "Concentrated",
          "week": {
            "price_max": "-1",
            "price_min": "-1",
            "volume": "1365167.30602324"
          }
        }
      ],
      "freezable": {
        "authority": [],
        "status": "0"
      },
      "holder_count": "1020153",
      "holders": [
        {
          "account": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
          "balance": "7770515063166.43106",
          "is_locked": 0,
          "locked_detail": [],
          "percent": "0.0883",
          "tag": "",
          "token_account": "5hpfC9VBxVcoW9opCnM2PqR6YWRLBzrBpabJTZnwwNiw"
        },
        {
          "account": "51yZyDSnec4xnUv7XLRVYcDyV4x3wUtzrDcRaYbmQU5j",
          "balance": "5972593511837.95277",
          "is_locked": 0,
          "locked_detail": [],
          "percent": "0.0679",
          "tag": "",
          "token_account": "2vPvEovB1gw8bAUqasThEv6YMAdJ77AU3RxiUNqknEiw"
        }
      ],
      "lp_holders": [],
      "metadata": {
        "description": "The Official Bonk Inu token",
        "name": "Bonk",
        "symbol": "Bonk",
        "uri": "https://arweave.net/QPC6FYdUn-3V8ytFNuoCS85S2tHAuiDblh6u3CIZLsw"
      },
      "metadata_mutable": {
        "metadata_upgrade_authority": [
          {
            "address": "9AhKqLR67hwapvG8SA2JFXaCshXc9nALJjpKaHZrsbkw",
            "malicious_address": 0
          }
        ],
        "status": "1"
      },
      "mintable": {
        "authority": [],
        "status": "0"
      },
      "non_transferable": "0",
      "total_supply": "87994357732509.84075",
      "transfer_fee": {},
      "transfer_fee_upgradable": {
        "authority": [],
        "status": "0"
      },
      "transfer_hook": [],
      "transfer_hook_upgradable": {
        "authority": [],
        "status": "0"
      },
      "trusted_token": 0
    }
  }
} as const;

export const PYTH_FEEDS = [
  {
    "id": "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
    "market_hours": {
      "is_open": true,
      "next_open": null,
      "next_close": null
    },
    "attributes": {
      "asset_type": "Crypto",
      "description": "SOLANA / US DOLLAR",
      "display_symbol": "SOLUSD",
      "quote_currency": "USD",
      "schedule": "America/New_York;O,O,O,O,O,O,O;",
      "symbol": "Crypto.SOL/USD",
      "min_channel": "real_time"
    }
  },
  {
    "id": "55f8289be7450f1ae564dd9798e49e7d797d89adbc54fe4f8c906b1fcb94b0c3",
    "market_hours": {
      "is_open": true,
      "next_open": null,
      "next_close": null
    },
    "attributes": {
      "asset_type": "Crypto",
      "description": "BINANCE STAKED SOLANA / US DOLLAR",
      "display_symbol": "BNSOLUSD",
      "quote_currency": "USD",
      "schedule": "America/New_York;O,O,O,O,O,O,O;",
      "symbol": "Crypto.BNSOL/USD",
      "min_channel": "fixed_rate@200ms"
    }
  },
  {
    "id": "89875379e70f8fbadc17aef315adf3a8d5d160b811435537e03c97e8aac97d9c",
    "market_hours": {
      "is_open": true,
      "next_open": null,
      "next_close": null
    },
    "attributes": {
      "asset_type": "Crypto",
      "description": "BLAZESTAKE STAKED SOL / US DOLLAR",
      "display_symbol": "BSOLUSD",
      "quote_currency": "USD",
      "schedule": "America/New_York;O,O,O,O,O,O,O;",
      "symbol": "Crypto.BSOL/USD",
      "min_channel": "fixed_rate@200ms"
    }
  }
] as const;
