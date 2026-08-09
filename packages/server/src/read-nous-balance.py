#!/usr/bin/env python3
import json

from agent.billing_usage import build_usage_model


usage = build_usage_model(timeout=10.0)
print(json.dumps({
    "available": usage.available,
    "status": usage.status,
    "plan_name": usage.plan_name,
    "renews_at": usage.renews_at,
    "subscription_remaining_usd": usage.subscription_remaining_usd,
    "topup_remaining_usd": usage.topup_remaining_usd,
    "total_spendable_usd": usage.total_spendable_usd,
}))
