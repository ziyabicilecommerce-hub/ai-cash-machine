// J.A.R.V.I.S. Data Configuration
// Update this file daily with your real numbers

window.JARVIS_DATA = {
    greeting: "GOOD MORNING",
    generated: new Date().toISOString(),

    connectors: [
        { name: "SYSTEM", status: "online" },
        { name: "NETWORK", status: "online" },
        { name: "EXTERNAL", status: "offline" }
    ],

    // Big figures (bottom bar)
    figure1: "$42,850",    // Revenue
    figure2: "1,247",      // Active users/transactions
    figure3: "8.4%",       // Growth
    figure4: "24/7",       // Uptime/Status

    // Ticker text (scrolling bottom)
    ticker: "ALL SYSTEMS OPERATIONAL • REVENUE TRACKING ACTIVE • NETWORK STABLE • DATABASE SYNCED • AWAITING COMMANDS",

    // Priority message
    priority: "PROCESS PENDING PAYMENTS • REVIEW ANALYTICS • CHECK INTEGRATIONS",

    // Activity log (shown in left panel)
    activities: [
        "SYSTEM INITIALIZED",
        "CONNECTORS LOADED",
        "MONITORING REVENUE STREAMS",
        "API ENDPOINTS ACTIVE",
        "DATABASE SYNC COMPLETE",
        "AWAITING COMMANDS"
    ],

    // Payment status
    paymentDue: "PAYMENT DUE IN 7 DAYS",

    // Stats panel (right side bar fills)
    stats: {
        processing: 65,
        efficiency: 82,
        capacity: 45
    }
};
