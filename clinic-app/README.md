# تمارين البيت – سيستم العيادة

سيستم ويب لعيادة العلاج الطبيعي فيه 3 أطراف:

- **الأدمن:** يضيف الدكاترة والأخصائيين، ويشوف كل المرضى، وينقل المريض من أخصائي لأخصائي.
- **الدكتور / الأخصائي:** يضيف مرضى، ويكتب لكل مريض التمارين ومواعيدها وجرعاتها وتنبيهات خاصة بيه. بيتابع الالتزام والـ streak وبلاغات الألم. ولو المريض اتنقل لغيره، يفضل يشوف تاريخه من غير تعديل.
- **المريض:** يدخل برقم موبايله وباسورد. أول مرة يدخل نوعه وسنّه وشكله، وبيتعمل له شخصية تظهر في كل أنيميشن التمارين.

**قواعد التمارين** (متطبقة في قاعدة البيانات نفسها، فمحدش يقدر يتحايل عليها من المتصفح):

- كل تمرين بيفتح من المعاد اللي الأخصائي حدده لمدة **ساعتين**، وبعدهم **ساعة سماح** بيتسجل فيها متأخر، وبعدها بيتقفل.
- **الـ Streak** بيعد الأيام الكاملة ورا بعض. يوم الألم ويوم الاسترجاع بيحافظوا عليه من غير ما يزوّدوه.
- **استرجاع واحد في الأسبوع** يدوس عليه المريض بنفسه، والأسبوع بيتحسب من بداية العلاج. اليوم اللي اتفوّت ينفع يترجع لحد آخر اليوم اللي بعده.
- زرار **«عندي ألم»** مفتوح: بيبلّغ الأخصائي، واليوم يتحسب يوم راحة.
- **التنبيه (Caution)** بيظهر بخط أحمر واضح لكل تمرين، ومعاه تنبيه إضافي لو الأخصائي كتبه للمريض ده.
- **إشعار** أول ما وقت كل تمرين يفتح، والمريض يقدر يقفل الإشعارات خالص.

## محتويات الفولدر

| الفولدر | فيه إيه |
|---|---|
| `supabase/migrations/` | قاعدة البيانات والصلاحيات وقواعد المواعيد والـ streak ومكتبة تمارين الـ ACL |
| `supabase/functions/create-user/` | إضافة الحسابات وتغيير الباسورد، وبيتأكد من صلاحية اللي بيطلب |
| `supabase/functions/send-reminders/` | إرسال الإشعارات |
| `supabase/tests/` | اختبارات الصلاحيات والقواعد (34 اختبار، كلهم ناجحين على Postgres 16) |
| `web/` | الموقع (React + Vite) |

## تجربة سريعة من غير قاعدة بيانات

لو مفيش إعدادات Supabase، الموقع بيشتغل **نسخة تجريبية** بأمثلة. تقدر ترفعه على Vercel زي ما هو وتجرّب الـ 3 أدوار من صفحة الدخول.

## التشغيل الحقيقي (حوالي 20 دقيقة)

### 1. Supabase (قاعدة البيانات والدخول)
1. اعمل حساب على [supabase.com](https://supabase.com) و **New project**. اختار منطقة قريبة زي Frankfurt، واحفظ باسورد قاعدة البيانات.
2. من **SQL Editor** انسخ والصق محتوى الملفات دي بالترتيب، وكل واحد دوس **Run**:
   `0001_init.sql`، وبعده `0002_seed_acl.sql`، وبعده `0003_reminders.sql`.
3. **اقفل التسجيل المفتوح:** من Authentication ← Sign In / Providers اقفل **Allow new users to sign up**. كده محدش يعمل حساب لنفسه، والحسابات بتتعمل من جوه السيستم بس.
4. **اعمل حساب الأدمن الأول:**
   - Authentication ← Users ← **Add user**: اكتب إيميلك وباسورد، وعلّم Auto Confirm.
   - بعدها في SQL Editor شغّل السطر ده، وغيّر الإيميل والاسم:
     ```sql
     insert into public.profiles (id, role, full_name)
     select id, 'admin', 'اسمك هنا' from auth.users where email = 'you@example.com';
     ```
5. **ارفع function إضافة الحسابات:** Edge Functions ← **Deploy a new function** ← Via Editor. سمّيها `create-user`، والصق محتوى `supabase/functions/create-user/index.ts`، ودوس Deploy.
6. من Project Settings ← API خد **Project URL** و **anon public key**. دول عاديين يتحطوا في الموقع. **المفتاح السري (service_role) ماتحطوش في أي حتة غير Supabase نفسه، وماتبعتوش لحد.**

### 2. Vercel (نشر الموقع)
1. اعمل حساب على [vercel.com](https://vercel.com) بحساب GitHub بتاعك، و **Add New ← Project** واختار الريبو ده.
2. **Root Directory:** `clinic-app/web`. الـ Framework هيتعرف لوحده (Vite).
3. في **Environment Variables** حط `VITE_SUPABASE_URL` و `VITE_SUPABASE_ANON_KEY` من الخطوة 1.6.
4. **Deploy**. هتاخد لينك زي `your-clinic.vercel.app`، وأي تعديل يترفع على GitHub بيتنشر لوحده.

### 3. الإشعارات (ممكن تتعمل بعدين)
1. اعمل مفاتيح VAPID مرة واحدة من أي جهاز عليه Node: `npx web-push generate-vapid-keys`.
2. في Supabase ← Edge Functions ← Secrets ضيف: `VAPID_PUBLIC_KEY`، و`VAPID_PRIVATE_KEY`، و`VAPID_SUBJECT` (مثلًا `mailto:clinic@example.com`)، و`CRON_SECRET` (أي كلام طويل عشوائي).
3. ارفع function اسمها `send-reminders` بنفس طريقة 1.5. ومن إعدادات الـ function اقفل **Verify JWT**، لأن الحماية هنا بالـ `CRON_SECRET`.
4. في Vercel ضيف `VITE_VAPID_PUBLIC_KEY` واعمل Redeploy.
5. فعّل الـ extensions بتاعة `pg_cron` و `pg_net` من Database ← Extensions، وبعدين شغّل في SQL Editor، وغيّر اللينك والسر:
   ```sql
   select cron.schedule('exercise-reminders', '*/5 * * * *', $$
     select net.http_post(
       url := 'https://YOUR-PROJECT.supabase.co/functions/v1/send-reminders',
       headers := '{"x-cron-secret": "YOUR-CRON-SECRET"}'::jsonb)
   $$);
   ```

**على الآيفون:** الإشعارات بتشتغل بس لو المريض فتح الموقع من Safari ودوس **مشاركة ← Add to Home Screen**، وفتحه من الأيقونة. ده محتاج iOS 16.4 أو أحدث. على أندرويد بتشتغل عادي.

## ملاحظات مهمة

- **دخول المرضى برقم الموبايل:** الرقم بيتحول جوه السيستم لإيميل وهمي (`01xxxxxxxxx@patients.invalid`)، فمش محتاجين SMS بفلوس. لو Supabase رفض الدومين ده، غيّره لدومين تاني في secret اسمه `PATIENT_EMAIL_DOMAIN` بتاع الـ function، وفي `VITE_PATIENT_EMAIL_DOMAIN` على Vercel، ولازم الاتنين يبقوا نفس القيمة.
- **مواعيد التمارين** بتوقيت القاهرة.
- **الخطة المجانية لـ Supabase** بتوقف المشروع لو محدش استخدمه أسبوع. للشغل الفعلي مع مرضى، الأفضل الخطة المدفوعة.
- **البيانات الصحية** بيانات حساسة حسب قانون حماية البيانات الشخصية المصري (151 لسنة 2020). خد موافقة المرضى، وراجع السيستم مع مختص أمن قبل ما تستخدمه مع عدد كبير من المرضى.

## المحتوى العلمي

- **مكتبة التمارين** (`0002_seed_acl.sql`) فيها 12 تمرين لتأهيل الـ ACL على مرحلتين. لكل تمرين خطوات ونصيحة وتنبيه.
- **الجرعات** المكتوبة افتراضية، والأخصائي بيحدد جرعة كل مريض.
- **الانتقال بين المراحل** بالشروط (criteria-based) وبقرار الأخصائي، مش بعدد الأسابيع بس، وده متوافق مع الـ guidelines الحديثة لتأهيل الـ ACL.
- **مطلوب مراجعة:** المحتوى والشروط محتاجين مراجعة أخصائي على الـ guidelines المعتمدة قبل الاستخدام مع المرضى، زي KNGF (van Melick et al., BJSM 2016)، وAspetar (Kotsifaki et al., BJSM 2023)، وJOSPT CPG (Logerstedt et al., 2017).

## للمطورين

```bash
cd web && npm install && npm run dev        # النسخة التجريبية على localhost
# اختبارات قاعدة البيانات على Postgres محلي:
cd supabase/tests && psql -d scratch -v ON_ERROR_STOP=1 -f supabase_shim.sql \
  -f ../migrations/0001_init.sql -f ../migrations/0002_seed_acl.sql -f ../migrations/0003_reminders.sql -f test_rules.sql
```
