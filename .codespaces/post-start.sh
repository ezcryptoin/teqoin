

# File: .codespaces/post-start.sh
#!/bin/bash
# Script ini otomatis dijalankan saat Codespace siap

echo "🚀 Loading TeQoin Bot aliases..."

# Source .bashrc agar alias tersedia
if [ -f "$HOME/.bashrc" ]; then
    source "$HOME/.bashrc"
fi

# Tambahkan alias ke bashrc user jika belum ada
if ! grep -q "TEQOIN BOT ALIASES" ~/.bashrc 2>/dev/null; then
    cat .bashrc >> ~/.bashrc
    source ~/.bashrc
fi

echo "✅ Bot aliases loaded! Ketik 'bot' untuk menjalankan."
echo "📋 Available commands:"
echo "   bot          → Run default (50000 tx, 0.000001 ETH)"
echo "   bot-test     → Run test mode"
echo "   bot-fast     → Run without delay"
echo "   bot-marquee  → Run with visual effect"
echo "   bot-status   → Check wallet balance"
