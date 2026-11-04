import { insforge } from './insforge';
import type {
  Application,
  Attendance,
  Availability,
  Dispute,
  EmployerProfile,
  Hire,
  Job,
  JobSearchRow,
  Message,
  Notification,
  Payment,
  PlatformStats,
  PortfolioItem,
  Profile,
  PublicWorkerRow,
  Review,
  Role,
  Skill,
  WorkerProfile,
  WorkerSearchRow,
} from './types';

/** Unwraps `{ data, error }` from the SDK and throws on error so callers can try/catch. */
async function unwrap<T>(p: Promise<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data as T;
}

const PUBLIC_PROFILE_COLUMNS =
  'id,role,name,profile_photo,location,latitude,longitude,language,verification_status,created_at';

const db = () => insforge.database;
const rpc = <T>(fn: string, args?: Record<string, unknown>) =>
  unwrap<T>(db().rpc(fn, args ?? {}) as unknown as Promise<{ data: T | null; error: unknown }>);

/* ------------------------------------------------------------------ public */

export const api = {
  platformStats: () => rpc<PlatformStats>('platform_stats'),

  /** Request a login OTP for a mobile number (delivered by SMS; dev_code while no SMS provider is set). */
  otpSend: (mobile: string) =>
    unwrap<{ sent: boolean; dev_code?: string; email: string }>(
      insforge.functions.invoke('otp_send', { body: { mobile } }) as unknown as Promise<{
        data: { sent: boolean; dev_code?: string; email: string } | null;
        error: unknown;
      }>,
    ),

  publicAvailableWorkers: (limit = 6) =>
    rpc<PublicWorkerRow[]>('public_available_workers', { p_limit: limit }),

  skills: () =>
    unwrap<Skill[]>(db().from('skills').select('*').order('name_hi', { ascending: true }) as never),

  /* ------------------------------------------------------------- profiles */

  myProfile: () =>
    rpc<{ profile: Profile | null; worker: WorkerProfile | null; employer: EmployerProfile | null }>(
      'get_my_profile',
    ),

  createMyProfile: (input: {
    role: Role;
    name: string;
    phone?: string;
    location?: string;
    latitude?: number | null;
    longitude?: number | null;
    company_name?: string;
    business_type?: string;
    experience?: number;
    expected_wage?: number;
    /** live photo captured from the camera during registration */
    profile_photo?: string;
    profile_photo_key?: string;
  }) =>
    rpc('create_my_profile', {
      p_role: input.role,
      p_name: input.name,
      p_phone: input.phone ?? null,
      p_location: input.location ?? null,
      p_latitude: input.latitude ?? null,
      p_longitude: input.longitude ?? null,
      p_company_name: input.company_name ?? null,
      p_business_type: input.business_type ?? null,
      p_profile_photo: input.profile_photo ?? null,
      p_profile_photo_key: input.profile_photo_key ?? null,
      p_experience: input.experience ?? 0,
      p_expected_wage: input.expected_wage ?? 0,
    }),

  updateProfile: (id: string, patch: Partial<Profile>) =>
    unwrap(db().from('profiles').update(patch).eq('id', id) as never),

  updateWorkerProfile: (userId: string, patch: Partial<WorkerProfile>) =>
    unwrap(db().from('worker_profiles').update(patch).eq('user_id', userId) as never),

  updateEmployerProfile: (userId: string, patch: Partial<EmployerProfile>) =>
    unwrap(db().from('employer_profiles').update(patch).eq('user_id', userId) as never),

  /** Columns every signed-in user is allowed to read. `phone` is intentionally excluded —
   *  it is only ever returned to the owner through the get_my_profile() RPC. */
  getProfile: (id: string) =>
    unwrap<Profile[]>(
      db().from('profiles').select(PUBLIC_PROFILE_COLUMNS).eq('id', id) as never,
    ).then((r) => r[0] ?? null),

  getWorkerProfile: (userId: string) =>
    unwrap<WorkerProfile[]>(
      db().from('worker_profiles').select('*').eq('user_id', userId) as never,
    ).then((r) => r[0] ?? null),

  getEmployerProfile: (userId: string) =>
    unwrap<EmployerProfile[]>(
      db().from('employer_profiles').select('*').eq('user_id', userId) as never,
    ).then((r) => r[0] ?? null),

  /* --------------------------------------------------------- worker skills */

  workerSkills: (workerId: string) =>
    unwrap<{ id: string; skill_id: string; experience: number; is_primary: boolean }[]>(
      db().from('worker_skills').select('*').eq('worker_id', workerId) as never,
    ),

  addWorkerSkill: (workerId: string, skillId: string, experience: number) =>
    unwrap(
      db()
        .from('worker_skills')
        .insert([{ worker_id: workerId, skill_id: skillId, experience }])
        .select() as never,
    ),

  removeWorkerSkill: (id: string) => unwrap(db().from('worker_skills').delete().eq('id', id) as never),

  /* ---------------------------------------------------------- availability */

  myAvailability: (workerId: string) =>
    unwrap<Availability[]>(
      db()
        .from('worker_availability')
        .select('*')
        .eq('worker_id', workerId)
        .order('created_at', { ascending: false })
        .limit(20) as never,
    ),

  publishAvailability: (input: {
    skill_id: string | null;
    location: string;
    radius: number;
    available_from: string;
    available_until: string;
    expected_wage: number;
    job_type: string;
    available_time?: string;
    latitude?: number | null;
    longitude?: number | null;
    note?: string;
  }) =>
    rpc<Availability>('publish_availability', {
      p_skill_id: input.skill_id,
      p_location: input.location,
      p_radius: input.radius,
      p_available_from: input.available_from,
      p_available_until: input.available_until,
      p_expected_wage: input.expected_wage,
      p_job_type: input.job_type,
      p_available_time: input.available_time ?? null,
      p_latitude: input.latitude ?? null,
      p_longitude: input.longitude ?? null,
      p_note: input.note ?? null,
    }),

  stopAvailability: () => rpc('stop_availability'),
  expireAvailability: () => rpc<number>('expire_availability'),

  searchWorkers: (f: {
    skill_id?: string | null;
    max_wage?: number | null;
    min_rating?: number | null;
    min_experience?: number | null;
    lat?: number | null;
    lng?: number | null;
    max_distance?: number | null;
    search?: string | null;
  }) =>
    rpc<WorkerSearchRow[]>('search_available_workers', {
      p_skill_id: f.skill_id ?? null,
      p_max_wage: f.max_wage ?? null,
      p_min_rating: f.min_rating ?? null,
      p_min_experience: f.min_experience ?? null,
      p_lat: f.lat ?? null,
      p_lng: f.lng ?? null,
      p_max_distance: f.max_distance ?? null,
      p_search: f.search ?? null,
      p_limit: 100,
    }),

  /* ------------------------------------------------------------------ jobs */

  searchJobs: (f: {
    skill_id?: string | null;
    min_wage?: number | null;
    lat?: number | null;
    lng?: number | null;
    max_distance?: number | null;
    search?: string | null;
  }) =>
    rpc<JobSearchRow[]>('search_available_jobs', {
      p_skill_id: f.skill_id ?? null,
      p_min_wage: f.min_wage ?? null,
      p_lat: f.lat ?? null,
      p_lng: f.lng ?? null,
      p_max_distance: f.max_distance ?? null,
      p_search: f.search ?? null,
      p_limit: 100,
    }),

  myJobs: (employerId: string) =>
    unwrap<Job[]>(
      db()
        .from('jobs')
        .select('*')
        .eq('employer_id', employerId)
        .order('created_at', { ascending: false }) as never,
    ),

  getJob: (id: string) =>
    unwrap<Job[]>(db().from('jobs').select('*').eq('id', id) as never).then((r) => r[0] ?? null),

  createJob: (job: Partial<Job>) =>
    unwrap<Job[]>(db().from('jobs').insert([job]).select() as never).then((r) =>
      Array.isArray(r) ? r[0] : (r as unknown as Job),
    ),

  updateJob: (id: string, patch: Partial<Job>) =>
    unwrap(db().from('jobs').update(patch).eq('id', id) as never),

  /* ---------------------------------------------------------- applications */

  applyToJob: (jobId: string, message?: string) =>
    rpc<Application>('apply_to_job', { p_job_id: jobId, p_message: message ?? null }),

  inviteWorker: (jobId: string, workerId: string, message?: string) =>
    rpc<Application>('invite_worker', {
      p_job_id: jobId,
      p_worker_id: workerId,
      p_message: message ?? null,
    }),

  setApplicationStatus: (id: string, status: string) =>
    rpc<Application>('update_application_status', { p_application_id: id, p_status: status }),

  acceptApplication: (id: string) => rpc<Hire>('accept_application', { p_application_id: id }),

  myApplications: (workerId: string) =>
    unwrap<Application[]>(
      db()
        .from('applications')
        .select('*')
        .eq('worker_id', workerId)
        .order('applied_at', { ascending: false }) as never,
    ),

  employerApplications: (employerId: string) =>
    unwrap<Application[]>(
      db()
        .from('applications')
        .select('*')
        .eq('employer_id', employerId)
        .order('applied_at', { ascending: false }) as never,
    ),

  /* ----------------------------------------------------------------- hires */

  myHires: (userId: string, as: 'worker' | 'employer') =>
    unwrap<Hire[]>(
      db()
        .from('hires')
        .select('*')
        .eq(as === 'worker' ? 'worker_id' : 'employer_id', userId)
        .order('work_date', { ascending: false }) as never,
    ),

  /* ------------------------------------------------------------ attendance */

  myAttendance: (userId: string, as: 'worker' | 'employer') =>
    unwrap<Attendance[]>(
      db()
        .from('attendance')
        .select('*')
        .eq(as === 'worker' ? 'worker_id' : 'employer_id', userId)
        .order('date', { ascending: false }) as never,
    ),

  markAttendance: (attendanceId: string, action: 'worker_in' | 'employer_in' | 'worker_out' | 'employer_out') =>
    rpc<Attendance>('mark_attendance', { p_attendance_id: attendanceId, p_action: action }),

  /* -------------------------------------------------------------- payments */

  myPayments: (userId: string, as: 'worker' | 'employer') =>
    unwrap<Payment[]>(
      db()
        .from('payments')
        .select('*')
        .eq(as === 'worker' ? 'worker_id' : 'employer_id', userId)
        .order('created_at', { ascending: false }) as never,
    ),

  recordPayment: (paymentId: string, amount: number, method: string, reference?: string, note?: string) =>
    rpc<Payment>('record_payment', {
      p_payment_id: paymentId,
      p_amount: amount,
      p_method: method,
      p_reference: reference ?? null,
      p_note: note ?? null,
    }),

  /* --------------------------------------------------------------- reviews */

  reviewsFor: (userId: string) =>
    unwrap<Review[]>(
      db()
        .from('reviews')
        .select('*')
        .eq('reviewed_user_id', userId)
        .order('created_at', { ascending: false }) as never,
    ),

  reviewsBy: (userId: string) =>
    unwrap<Review[]>(db().from('reviews').select('*').eq('reviewer_id', userId) as never),

  submitReview: (
    hireId: string,
    rating: number,
    categories: Record<string, number>,
    review?: string,
    workPhoto?: string,
  ) =>
    rpc<Review>('submit_review', {
      p_hire_id: hireId,
      p_rating: rating,
      p_categories: categories,
      p_review: review ?? null,
      p_work_photo: workPhoto ?? null,
    }),

  /* -------------------------------------------------------------- messages */

  allMyMessages: () =>
    unwrap<Message[]>(
      db().from('messages').select('*').order('created_at', { ascending: true }).limit(500) as never,
    ),

  sendMessage: (m: {
    sender_id: string;
    receiver_id: string;
    job_id?: string | null;
    message: string;
    message_type?: 'text' | 'image';
    attachment_url?: string | null;
  }) => unwrap(db().from('messages').insert([m]).select() as never),

  markMessagesRead: (ids: string[]) =>
    Promise.all(
      ids.map((id) =>
        unwrap(
          db().from('messages').update({ read_at: new Date().toISOString() }).eq('id', id) as never,
        ).catch(() => undefined),
      ),
    ),

  /* --------------------------------------------------------- notifications */

  myNotifications: (userId: string) =>
    unwrap<Notification[]>(
      db()
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50) as never,
    ),

  markNotificationRead: (id: string) =>
    unwrap(db().from('notifications').update({ read_status: true }).eq('id', id) as never),

  /* -------------------------------------------------------------- disputes */

  myDisputes: (userId: string) =>
    unwrap<Dispute[]>(
      db()
        .from('disputes')
        .select('*')
        .eq('raised_by', userId)
        .order('created_at', { ascending: false }) as never,
    ),

  raiseDispute: (input: {
    type: string;
    description: string;
    hire_id?: string | null;
    attendance_id?: string | null;
    evidence?: string | null;
  }) =>
    rpc<Dispute>('raise_dispute', {
      p_type: input.type,
      p_description: input.description,
      p_hire_id: input.hire_id ?? null,
      p_attendance_id: input.attendance_id ?? null,
      p_evidence: input.evidence ?? null,
    }),

  /* ------------------------------------------------------------- portfolio */

  portfolioOf: (workerId: string) =>
    unwrap<PortfolioItem[]>(
      db()
        .from('portfolio')
        .select('*')
        .eq('worker_id', workerId)
        .order('created_at', { ascending: false }) as never,
    ),

  addPortfolio: (item: Partial<PortfolioItem>) =>
    unwrap(db().from('portfolio').insert([item]).select() as never),

  removePortfolio: (id: string) => unwrap(db().from('portfolio').delete().eq('id', id) as never),

  uploadFile: async (bucket: string, file: File) => {
    const { data, error } = await insforge.storage.from(bucket).uploadAuto(file);
    if (error) throw error;
    return data as { url: string; key: string };
  },

  /* ------------------------------------------------------ password reset */

  requestPasswordReset: (mobile: string) =>
    rpc<{ request_id: string; name: string; role: string; status: string }>(
      'request_password_reset',
      { p_mobile_raw: mobile },
    ),

  getResetRequest: (requestId: string) =>
    rpc<{ status: string; temp_password?: string; admin_note?: string | null }>(
      'get_password_reset_request',
      { p_request_id: requestId },
    ),

  changeMyPassword: (current: string, next: string) =>
    rpc<{ ok: boolean }>('change_my_password', { p_current: current, p_new: next }),

  adminResetRequests: (status = 'pending', limit = 50) =>
    rpc<
      Array<{
        id: string;
        mobile: string;
        user_name: string;
        user_role: string;
        status: string;
        admin_note: string | null;
        created_at: string;
        resolved_at: string | null;
      }>
    >('admin_reset_requests', { p_status: status, p_limit: limit }),

  adminApproveReset: (requestId: string) =>
    rpc<{ status: string }>('admin_approve_reset_request', { p_request_id: requestId }),

  adminRejectReset: (requestId: string, note?: string) =>
    rpc<{ status: string }>('admin_reject_reset_request', { p_request_id: requestId, p_note: note ?? null }),

  adminSetUserRole: (mobile: string, role: 'worker' | 'employer' | 'admin') =>
    rpc<{ name: string; mobile: string; previous_role: string; new_role: string }>(
      'admin_set_user_role',
      { p_mobile_raw: mobile, p_new_role: role },
    ),

  /* ------------------------------------------------------------------ admin */

  adminStats: () => rpc<Record<string, number>>('admin_stats'),
  adminList: <T>(entity: string, limit = 200) => rpc<T[]>('admin_list', { p_entity: entity, p_limit: limit }),
  adminSetVerification: (userId: string, status: string) =>
    rpc('admin_set_verification', { p_user_id: userId, p_status: status }),
  adminResolveDispute: (id: string, status: string, resolution: string) =>
    rpc('admin_resolve_dispute', { p_dispute_id: id, p_status: status, p_resolution: resolution }),
};
