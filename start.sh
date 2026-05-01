#!/bin/bash

echo ""
echo "=========================================="
echo "     Plan Buyer Bot - Quick Start"
echo "=========================================="
echo ""
echo "WARNING: This bot requires Chrome with remote debugging!"
echo "Make sure Chrome is running with: --remote-debugging-port=9222"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "[1/4] Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "ERROR: Failed to install dependencies"
        exit 1
    fi
else
    echo "[1/4] Dependencies already installed"
fi

echo ""
echo "[2/4] Choose your strategy:"
echo ""
echo "1. Pre-position (recommended if you can be on the site early)"
echo "   - Opens tabs and waits on the page before the rush"
echo "   - Lower risk of getting kicked out"
echo ""
echo "2. Refresh Spam (for hot drops with instant sellout)"
echo "   - Continuously refreshes all tabs"
echo "   - Higher success rate but risk of rate limiting"
echo ""
echo "3. Hybrid (recommended for most scenarios)"
echo "   - Starts with pre-position, then switches to refresh"
echo ""

read -p "Enter choice (1-3): " strategy_choice

case $strategy_choice in
    1) STRATEGY="pre-position" ;;
    2) STRATEGY="refresh-spam" ;;
    3) STRATEGY="hybrid" ;;
    *) echo "Invalid choice, using hybrid strategy"; STRATEGY="hybrid" ;;
esac

echo ""
echo "[3/4] How many tabs? (10-20 recommended)"
read -p "Enter number of tabs (default: 15): " tabs
tabs=${tabs:-15}

echo ""
echo "[4/4] Choose plan tier:"
echo "  1. Lite"
echo "  2. Pro"
echo "  3. Max (default)"
read -p "Enter choice (1-3): " plan_choice

case $plan_choice in
    1) PLAN="lite" ;;
    2) PLAN="pro" ;;
    3) PLAN="max" ;;
    *) PLAN="max" ;;
esac

echo ""
echo "=========================================="
echo "     Configuration Summary"
echo "=========================================="
echo "Strategy: $STRATEGY"
echo "Tabs: $tabs"
echo "Plan: $PLAN"
echo ""
echo "IMPORTANT: Make sure you're already logged in to the target site!"
echo ""
read -p "Press Enter to start..."

echo ""
echo "Starting Plan Buyer Bot..."
echo "Press Ctrl+C to stop at any time"
echo ""

npx tsx src/index.ts --tabs=$tabs --strategy=$STRATEGY --plan=$PLAN

echo ""
echo "Bot stopped."
read -p "Press Enter to exit..."
