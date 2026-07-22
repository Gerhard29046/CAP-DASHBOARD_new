const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

if (admin.apps.length === 0) {
  admin.initializeApp();
}

// CRITICAL: the CAP Dashboard data lives in the NAMED Firestore database
// "capdashboard", not the (default) database. Never drop the second argument
// below, or every read/write here will silently target the wrong database.
const db = getFirestore(admin.app(), "capdashboard");

module.exports = { admin, db };
