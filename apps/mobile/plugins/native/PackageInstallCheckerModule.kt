package com.adpayon.app

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Scoped Android PackageManager installation checker.
 * Strictly verifies presence for explicitly declared target packages.
 * Does NOT request broad QUERY_ALL_PACKAGES or collect inventory of other apps.
 */
class PackageInstallCheckerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "PackageInstallChecker"

    @ReactMethod
    fun isPackageInstalled(packageName: String, promise: Promise) {
        try {
            if (packageName.isBlank()) {
                promise.reject("INVALID_PACKAGE", "Package name cannot be blank")
                return
            }

            val pm: PackageManager = reactApplicationContext.packageManager
            try {
                pm.getPackageInfo(packageName, 0)
                promise.resolve(true)
            } catch (e: PackageManager.NameNotFoundException) {
                promise.resolve(false)
            }
        } catch (t: Throwable) {
            promise.reject("CHECK_FAILED", t.message, t)
        }
    }

    @ReactMethod
    fun openInstalledApp(packageName: String, promise: Promise) {
        try {
            if (packageName.isBlank()) {
                promise.reject("INVALID_PACKAGE", "Package name cannot be blank")
                return
            }

            val pm: PackageManager = reactApplicationContext.packageManager
            val launchIntent: Intent? = pm.getLaunchIntentForPackage(packageName)
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                reactApplicationContext.startActivity(launchIntent)
                promise.resolve(true)
            } else {
                promise.resolve(false)
            }
        } catch (t: Throwable) {
            promise.reject("OPEN_FAILED", t.message, t)
        }
    }
}

