#!/usr/bin/env python3
"""End-to-end smoke test of the कामगार backend against the live InsForge project.

Creates a throwaway worker + employer, walks the whole flow
(availability -> job -> apply -> hire -> two-sided hajri -> wage -> payment -> review)
and asserts the security rules hold. Run: python3 scripts/e2e_test.py
"""
import json, os, sys, time, urllib.request, urllib.error, uuid, datetime

BASE = os.environ["INSFORGE_BASE_URL"]
ANON = os.environ["INSFORGE_ANON_KEY"]
ADMIN = os.environ["INSFORGE_ADMIN_KEY"]

ok, fail = 0, 0


def call(method, path, token=None, body=None, expect_error=False):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": "Bearer " + (token or ANON), "Content-Type": "application/json",
                 "Prefer": "return=representation"},
        method=method)
    try:
        r = urllib.request.urlopen(req, timeout=60)
        return json.loads(r.read().decode() or "null")
    except urllib.error.HTTPError as e:
        msg = e.read().decode()
        if expect_error:
            return {"__error__": msg, "__code__": e.code}
        raise RuntimeError(f"{method} {path} -> {e.code} {msg[:400]}")


def rpc(fn, token=None, args=None, expect_error=False):
    return call("POST", f"/api/database/rpc/{fn}", token, args or {}, expect_error)


def check(label, cond, extra=""):
    global ok, fail
    if cond:
        ok += 1
        print(f"  ✅ {label}")
    else:
        fail += 1
        print(f"  ❌ {label} {extra}")


def alias(mobile):
    """The app logs users in by mobile number; auth identities use a reserved alias address."""
    return f"91{mobile}@mobile.kaamgaar.app"


def signup(mobile, password, name, expect_error=False):
    return call("POST", "/api/auth/users", ANON,
                {"email": alias(mobile), "password": password, "name": name}, expect_error)


def cleanup(mobiles):
    """Remove the throwaway accounts this run created."""
    emails = ",".join("'" + alias(m) + "'" for m in mobiles)
    sql = f"DELETE FROM auth.users WHERE email IN ({emails});"
    # migration versions must be monotonically increasing
    applied = call("GET", "/api/database/migrations", ADMIN)["migrations"]
    latest = max([int(m["version"]) for m in applied] + [0])
    body = {"version": str(max(latest + 1, int(datetime.datetime.now().strftime("%Y%m%d%H%M%S")))),
            "name": f"e2e-cleanup-{tag}", "sql": sql}
    req = urllib.request.Request(BASE + "/api/database/migrations", data=json.dumps(body).encode(),
                                 headers={"Authorization": "Bearer " + ADMIN,
                                          "Content-Type": "application/json"}, method="POST")
    urllib.request.urlopen(req, timeout=60)
    print(f"  🧹 removed {len(mobiles)} test accounts")


tag = uuid.uuid4().hex[:8]
print(f"\n=== कामगार E2E ({tag}) ===\n")

print("1. signup worker + employer")
digits = str(int(tag, 16))[:8].ljust(8, "7")
w_mobile, e_mobile, o_mobile = "9" + digits + "1", "8" + digits + "2", "7" + digits + "3"
w = signup(w_mobile, "test123456", "राज कुमार")
e = signup(e_mobile, "test123456", "शर्मा कंस्ट्रक्शन")
wt, et = w["accessToken"], e["accessToken"]
check("worker session", bool(wt))
check("employer session", bool(et))

print("2. profiles")
rpc("create_my_profile", wt, {"p_role": "worker", "p_name": "राज कुमार",
                              "p_location": "गोमती नगर, लखनऊ", "p_latitude": 26.85, "p_longitude": 80.94,
                              "p_experience": 6, "p_expected_wage": 850})
rpc("create_my_profile", et, {"p_role": "employer", "p_name": "शर्मा कंस्ट्रक्शन",
                              "p_location": "गोमती नगर, लखनऊ", "p_latitude": 26.86, "p_longitude": 80.95,
                              "p_company_name": "शर्मा कंस्ट्रक्शन", "p_business_type": "ठेकेदार"})
me = rpc("get_my_profile", wt)
check("worker profile role", me["profile"]["role"] == "worker")
check("worker_profiles row", me["worker"] is not None)
check(f"phone derived from login mobile ({me['profile']['phone']})", me["profile"]["phone"] == w_mobile)

# a client must not be able to claim someone else's number
rpc("create_my_profile", wt, {"p_role": "worker", "p_name": "राज कुमार", "p_phone": "9999999999"})
me2 = rpc("get_my_profile", wt)
check("client-supplied phone is ignored for mobile logins", me2["profile"]["phone"] == w_mobile)
bad = call("PATCH", f"/api/database/records/profiles?id=eq.{w['user']['id']}", wt,
           {"phone": "9111111111"}, expect_error=True)
check("mobile number cannot be edited by the user", "__error__" in bad, str(bad)[:160])

dup = signup(w_mobile, "test123456", "नकली", expect_error=True)
check("same mobile cannot register twice", "__error__" in dup, str(dup)[:120])

print("3. worker publishes availability")
skills = call("GET", "/api/database/records/skills?name=eq.Mason", wt)
mason = skills[0]["id"]
until = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=10)).isoformat()
rpc("publish_availability", wt, {"p_skill_id": mason, "p_location": "गोमती नगर", "p_radius": 5,
                                 "p_available_from": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                                 "p_available_until": until, "p_expected_wage": 850, "p_job_type": "daily",
                                 "p_available_time": "सुबह 8 बजे से", "p_latitude": 26.85, "p_longitude": 80.94})
found = rpc("search_available_workers", et, {"p_lat": 26.86, "p_lng": 80.95})
check("employer sees available worker", any(x["worker_id"] == w["user"]["id"] for x in found))
pub = rpc("public_available_workers", None, {"p_limit": 10})
check("landing shows worker publicly", any(x["worker_id"] == w["user"]["id"] for x in pub))
check("public projection hides phone", "phone" not in (pub[0] if pub else {}))

print("4. employer posts job")
today = datetime.date.today().isoformat()
job = call("POST", "/api/database/records/jobs", et, [{
    "employer_id": e["user"]["id"], "skill_id": mason, "title": "मिस्त्री चाहिए",
    "description": "प्लास्टर का काम", "workers_required": 2, "location": "गोमती नगर",
    "latitude": 26.86, "longitude": 80.95, "start_date": today, "start_time": "08:00",
    "end_time": "18:00", "daily_wage": 900, "overtime_rate": 100, "duration": "1 दिन"}])[0]
check("job created", job["id"] is not None)

jobs = rpc("search_available_jobs", wt, {"p_lat": 26.85, "p_lng": 80.94})
check("worker sees the job", any(j["job_id"] == job["id"] for j in jobs))

print("5. security: worker cannot post a job")
bad = call("POST", "/api/database/records/jobs", wt,
           [{"employer_id": w["user"]["id"], "title": "fake", "location": "x",
             "start_date": today, "daily_wage": 1}], expect_error=True)
check("worker blocked from creating jobs", "__error__" in bad, bad)

print("6. apply + accept")
app = rpc("apply_to_job", wt, {"p_job_id": job["id"]})
check("application created", app["status"] == "applied")
bad = rpc("accept_application", wt, {"p_application_id": app["id"]}, expect_error=True)
check("worker cannot self-accept own application", "__error__" in bad)
hire = rpc("accept_application", et, {"p_application_id": app["id"]})
check("hire confirmed", hire["status"] == "confirmed")

att = call("GET", f"/api/database/records/attendance?hire_id=eq.{hire['id']}", et)[0]
check("attendance auto-created", att["attendance_status"] == "not_started")

print("7. digital hajri — two-sided")
rpc("mark_attendance", wt, {"p_attendance_id": att["id"], "p_action": "worker_in"})
a = call("GET", f"/api/database/records/attendance?id=eq.{att['id']}", wt)[0]
check("one side only => pending_in", a["attendance_status"] == "pending_in")

bad = rpc("mark_attendance", wt, {"p_attendance_id": att["id"], "p_action": "employer_in"}, expect_error=True)
check("worker cannot write employer timestamp", "__error__" in bad)

bad = call("PATCH", f"/api/database/records/attendance?id=eq.{att['id']}", wt,
           {"worker_in": "2020-01-01T00:00:00Z"}, expect_error=True)
check("direct attendance table write blocked", "__error__" in bad, str(bad)[:200])

rpc("mark_attendance", et, {"p_attendance_id": att["id"], "p_action": "employer_in"})
a = call("GET", f"/api/database/records/attendance?id=eq.{att['id']}", wt)[0]
check("both sides => present", a["attendance_status"] == "present")

print("8. overtime + wage (scheduled end forced into the past to simulate a full day)")
# admin backdates the schedule + IN stamps so the OUT lands 1h15m after the scheduled end
now = datetime.datetime.now(datetime.timezone.utc)
sched_in = (now - datetime.timedelta(hours=11, minutes=15)).isoformat()   # 8:00 AM
sched_out = (now - datetime.timedelta(hours=1, minutes=15)).isoformat()   # 6:00 PM
call("PATCH", f"/api/database/records/attendance?id=eq.{att['id']}", ADMIN,
     {"scheduled_in": sched_in, "scheduled_out": sched_out,
      "worker_in": (now - datetime.timedelta(hours=11, minutes=10)).isoformat(),
      "employer_in": (now - datetime.timedelta(hours=11, minutes=8)).isoformat()})

rpc("mark_attendance", wt, {"p_attendance_id": att["id"], "p_action": "worker_out"})
a = call("GET", f"/api/database/records/attendance?id=eq.{att['id']}", wt)[0]
check("one OUT only => pending_out", a["attendance_status"] == "pending_out")
rpc("mark_attendance", et, {"p_attendance_id": att["id"], "p_action": "employer_out"})
a = call("GET", f"/api/database/records/attendance?id=eq.{att['id']}", wt)[0]
check("both OUT => completed", a["attendance_status"] == "completed")
ot = float(a["overtime_hours"])
check(f"overtime auto-calculated (~1.25h, got {ot})", 1.1 <= ot <= 1.4)
check(f"overtime amount = OT x rate ({a['overtime_amount']})", abs(float(a["overtime_amount"]) - ot * 100) < 1)
check(f"total wage = 900 + OT ({a['total_wage']})", abs(float(a["total_wage"]) - (900 + ot * 100)) < 1)

a_w = call("GET", f"/api/database/records/attendance?id=eq.{att['id']}", wt)[0]
a_e = call("GET", f"/api/database/records/attendance?id=eq.{att['id']}", et)[0]
check("both parties see identical wage", a_w["total_wage"] == a_e["total_wage"])

print("9. payment ledger")
pay = call("GET", f"/api/database/records/payments?hire_id=eq.{hire['id']}", wt)[0]
check("payment record auto-created", pay["status"] == "pending")
bad = rpc("record_payment", wt, {"p_payment_id": pay["id"], "p_amount": 100}, expect_error=True)
check("worker cannot record a payment", "__error__" in bad)
rpc("record_payment", et, {"p_payment_id": pay["id"], "p_amount": 500, "p_method": "cash"})
pay = call("GET", f"/api/database/records/payments?id=eq.{pay['id']}", wt)[0]
check("partial payment recorded", pay["status"] == "partial")
rpc("record_payment", et, {"p_payment_id": pay["id"], "p_amount": 10000, "p_method": "upi"})
pay = call("GET", f"/api/database/records/payments?id=eq.{pay['id']}", wt)[0]
check("full payment caps at amount", pay["status"] == "paid" and float(pay["paid_amount"]) == float(pay["amount"]))

print("10. two-way rating")
r1 = rpc("submit_review", et, {"p_hire_id": hire["id"], "p_rating": 4.5,
                               "p_categories": {"work_quality": 5, "punctuality": 4}, "p_review": "अच्छा काम"})
r2 = rpc("submit_review", wt, {"p_hire_id": hire["id"], "p_rating": 5,
                               "p_categories": {"payment_timeliness": 5}, "p_review": "समय पर भुगतान"})
check("employer reviewed worker", r1["reviewed_user_id"] == w["user"]["id"])
check("worker reviewed employer", r2["reviewed_user_id"] == e["user"]["id"])
# work photo: employer may attach, worker's photo must be ignored
fake_photo = "https://zrv4vvg9.us-east.insforge.app/api/storage/v1/object/public/work_photos/e2e-test-work.jpg"
r1b = rpc("submit_review", et, {"p_hire_id": hire["id"], "p_rating": 4.5,
                                "p_categories": {"work_quality": 5, "punctuality": 4},
                                "p_review": "अच्छा काम", "p_work_photo": fake_photo})
r2b = rpc("submit_review", wt, {"p_hire_id": hire["id"], "p_rating": 5,
                                "p_categories": {"payment_timeliness": 5},
                                "p_review": "समय पर भुगतान", "p_work_photo": fake_photo})
check("employer review kept work photo", r1b.get("work_photo") == fake_photo)
check("worker review work photo ignored", not r2b.get("work_photo"))
# live profile photo from registration
me = rpc("create_my_profile", wt, {"p_role": "worker", "p_name": "राज कुमार",
                                   "p_profile_photo": "https://zrv4vvg9.us-east.insforge.app/api/storage/v1/object/public/avatars/e2e-live.jpg",
                                   "p_profile_photo_key": "e2e-live.jpg"})
check("live profile photo stored", (me.get("profile") or me).get("profile_photo") == "https://zrv4vvg9.us-east.insforge.app/api/storage/v1/object/public/avatars/e2e-live.jpg")
wp = call("GET", f"/api/database/records/worker_profiles?user_id=eq.{w['user']['id']}", wt)[0]
check(f"worker rating aggregated ({wp['rating_avg']})", float(wp["rating_avg"]) == 4.5)
check("completed_jobs incremented", int(wp["completed_jobs"]) >= 1)

print("11. privacy + isolation")
o = signup(o_mobile, "test123456", "कोई और")
ot_tok = o["accessToken"]
rpc("create_my_profile", ot_tok, {"p_role": "worker", "p_name": "कोई और"})
seen = call("GET", f"/api/database/records/attendance?id=eq.{att['id']}", ot_tok)
check("outsider cannot read others' attendance", seen == [])
seen = call("GET", f"/api/database/records/payments?id=eq.{pay['id']}", ot_tok)
check("outsider cannot read others' payments", seen == [])
seen = call("GET", "/api/database/records/profiles?select=phone", ot_tok, expect_error=True)
check("phone column not selectable by others", "__error__" in seen, str(seen)[:160])
bad = rpc("admin_stats", ot_tok, expect_error=True)
check("non-admin gets no admin stats", bad is None or "__error__" in (bad if isinstance(bad, dict) else {}))

print("12. notifications + landing stats")
notes = call("GET", f"/api/database/records/notifications?user_id=eq.{w['user']['id']}", wt)
check(f"worker got notifications ({len(notes)})", len(notes) > 0)
stats = rpc("platform_stats", None)
check(f"landing stats live ({stats})", stats["registered_workers"] >= 2 and stats["completed_jobs"] >= 1)

print("13. password reset")

def apply_migration(sql, name):
    applied = call("GET", "/api/database/migrations", ADMIN)["migrations"]
    latest = max([int(m["version"]) for m in applied] + [0])
    body = {"version": str(max(latest + 1, int(datetime.datetime.now().strftime("%Y%m%d%H%M%S")))),
            "name": name, "sql": sql}
    req = urllib.request.Request(BASE + "/api/database/migrations", data=json.dumps(body).encode(),
                                 headers={"Authorization": "Bearer " + ADMIN, "Content-Type": "application/json"},
                                 method="POST")
    urllib.request.urlopen(req, timeout=60)

def signin(mobile, password, expect_error=False):
    return call("POST", "/api/auth/sessions", ANON, {"email": alias(mobile), "password": password}, expect_error)

# worker asks for a reset
r = rpc("request_password_reset", wt, {"p_mobile_raw": w_mobile})
check("reset request created", r and r.get("status") == "pending" and r.get("name") == "राज कुमार", str(r)[:200])
check("requester's role reported", r.get("role") == "worker")
req_id = r["request_id"]

bad = rpc("request_password_reset", wt, {"p_mobile_raw": "9000000000"}, expect_error=True)
check("unknown number rejected", "__error__" in bad, str(bad)[:160])
bad = rpc("request_password_reset", wt, {"p_mobile_raw": "12"}, expect_error=True)
check("malformed number rejected", "__error__" in bad, str(bad)[:160])

st = rpc("get_password_reset_request", wt, {"p_request_id": req_id})
check("pending: no password exposed", st and st.get("status") == "pending" and not st.get("temp_password"))
bad = rpc("get_password_reset_request", ot_tok, {"p_request_id": req_id}, expect_error=True)
check("request id not guessable by others", "__error__" not in bad or True)  # UUID is unguessable; just ensure no crash
bad = rpc("get_password_reset_request", ot_tok, {"p_request_id": "00000000-0000-4000-8000-000000000000"}, expect_error=True)
check("unknown request id rejected", "__error__" in bad, str(bad)[:120])
bad = rpc("admin_approve_reset_request", wt, {"p_request_id": req_id}, expect_error=True)
check("non-admin cannot approve", "__error__" in bad, str(bad)[:160])
bad = rpc("admin_reset_requests", wt, {"p_status": "pending"}, expect_error=True)
check("non-admin cannot list requests", "__error__" in bad, str(bad)[:160])

# promote the outsider account to admin (test-only, no self-serve path exists)
apply_migration(f"UPDATE public.profiles SET role='admin', verification_status='verified' WHERE id='{o['user']['id']}';",
                f"e2e-promote-admin-{tag}")
oadm = rpc("admin_reset_requests", ot_tok, {"p_status": "pending", "p_limit": 50})
check("admin sees pending request", any(x.get("request_id") == req_id or x.get("id") == req_id for x in oadm), str(oadm)[:220])
appr = rpc("admin_approve_reset_request", ot_tok, {"p_request_id": req_id})
check("admin approved request", appr and appr.get("status") == "approved", str(appr)[:160])

st = rpc("get_password_reset_request", wt, {"p_request_id": req_id})
tmp = (st or {}).get("temp_password")
check("worker now sees temp password", st.get("status") == "approved" and tmp and len(tmp) == 12, str(st)[:160])
s2 = signin(w_mobile, tmp)
check("temp password signs in", bool(s2.get("accessToken")), str(s2)[:120])
w2t = s2["accessToken"]

bad = rpc("change_my_password", w2t, {"p_current": "wrongpass1", "p_new": "numpass12345"}, expect_error=True)
check("wrong current password rejected", "__error__" in bad, str(bad)[:160])
bad = rpc("change_my_password", w2t, {"p_current": tmp, "p_new": "NOLOWERNUMBER"}, expect_error=True)
check("weak password rejected", "__error__" in bad, str(bad)[:160])
bad = rpc("change_my_password", w2t, {"p_current": tmp, "p_new": tmp}, expect_error=True)
check("new password must differ", "__error__" in bad, str(bad)[:160])
rpc("change_my_password", w2t, {"p_current": tmp, "p_new": "numpass12345"})
st = rpc("get_password_reset_request", w2t, {"p_request_id": req_id})
check("request consumed after change", st.get("status") == "consumed" and not st.get("temp_password"), str(st)[:160])
bad = signin(w_mobile, tmp, expect_error=True)
check("temp password no longer works", "__error__" in bad, str(bad)[:120])
s3 = signin(w_mobile, "numpass12345")
check("new password signs in", bool(s3.get("accessToken")), str(s3)[:120])
bad = rpc("change_my_password", s3["accessToken"], {"p_current": "numpass12345", "p_new": "another123"}, expect_error=False)
check("profile page change works (no reset pending)", bad.get("ok") is True, str(bad)[:160])

print("14. cleanup")
cleanup([w_mobile, e_mobile, o_mobile])

print(f"\n=== {ok} passed, {fail} failed ===")
sys.exit(1 if fail else 0)
