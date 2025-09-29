import { connectToDatabase } from "../config/database";
import User from "../models/userModel";

async function promoteUser() {
    const identifier = process.argv[2];

    if (!identifier) {
        console.error("❌ Please provide a user ID or email address.");
        console.log("Usage: bun src/scripts/promoteAdmin.ts <userIdOrEmail>");
        process.exit(1);
    }

    try {
        await connectToDatabase();

        const isObjectId = /^[0-9a-fA-F]{24}$/.test(identifier);
        const query = isObjectId ? { _id: identifier } : { email: identifier };

        const user = await User.findOne(query);

        if (!user) {
            console.error(`❌ User not found with identifier: ${identifier}`);
            process.exit(1);
        }

        if (user.role === "admin") {
            console.warn(`⚠️ User ${user.name} (${user.email}) is already an admin.`);
            process.exit(0);
        }

        user.role = "admin";
        await user.save();

        console.log(`✅ Successfully promoted ${user.name} (${user.email}) to admin!`);
        process.exit(0);

    } catch (error) {
        console.error("🔥 An error occurred:", error);
        process.exit(1);
    }
}

promoteUser();