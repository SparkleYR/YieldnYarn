# Gson reflects over the wire types in :core.
-keep class com.msme.seller.core.model.** { *; }
-keepattributes Signature, *Annotation*, EnclosingMethod, InnerClasses

# Retrofit service interfaces (suspend functions keep their generic signatures).
-keep,allowobfuscation interface com.msme.seller.core.api.SellerApi
-keep,allowobfuscation interface com.msme.seller.core.api.PricingApi
-keep,allowobfuscation,allowshrinking class kotlin.coroutines.Continuation
-keep,allowobfuscation,allowshrinking class retrofit2.Response
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
