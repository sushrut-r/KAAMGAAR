export type Role = 'worker' | 'employer' | 'admin';

export interface Profile {
  id: string;
  role: Role;
  name: string;
  phone?: string | null;
  email?: string | null;
  profile_photo?: string | null;
  profile_photo_key?: string | null;
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  language: string;
  verification_status: 'pending' | 'verified' | 'rejected';
  is_flagged?: boolean;
  is_suspended?: boolean;
  created_at: string;
}

export interface WorkerProfile {
  id: string;
  user_id: string;
  experience: number;
  expected_daily_wage: number;
  availability_status: 'available' | 'offline' | 'hired';
  work_radius: number;
  work_score: number;
  bio?: string | null;
  rating_avg: number;
  rating_count: number;
  completed_jobs: number;
  total_earned: number;
}

export interface EmployerProfile {
  id: string;
  user_id: string;
  company_name?: string | null;
  business_type?: string | null;
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  verification_status: string;
  employer_score: number;
  rating_avg: number;
  rating_count: number;
  jobs_posted: number;
  workers_hired: number;
  completed_jobs: number;
}

export interface Skill {
  id: string;
  name: string;
  name_hi: string;
  category: string;
  icon: string;
}

export interface Availability {
  id: string;
  worker_id: string;
  skill_id: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  radius: number;
  available_from: string;
  available_until: string;
  available_time: string | null;
  expected_wage: number;
  job_type: string;
  note: string | null;
  status: 'active' | 'expired' | 'hired' | 'cancelled';
  created_at: string;
}

export interface Job {
  id: string;
  employer_id: string;
  skill_id: string | null;
  title: string;
  description: string | null;
  workers_required: number;
  workers_hired: number;
  location: string;
  latitude: number | null;
  longitude: number | null;
  start_date: string;
  start_time: string;
  end_time: string;
  daily_wage: number;
  overtime_rate: number;
  duration: string;
  duration_days: number;
  food: boolean;
  transport: boolean;
  other_facilities: string | null;
  status: 'open' | 'filled' | 'in_progress' | 'completed' | 'cancelled' | 'flagged';
  created_at: string;
}

export interface JobSearchRow {
  job_id: string;
  title: string;
  description: string | null;
  employer_id: string;
  employer_name: string;
  company_name: string | null;
  employer_rating: number | null;
  employer_verified: string | null;
  skill_id: string | null;
  skill: string | null;
  skill_hi: string | null;
  icon: string | null;
  location: string;
  workers_required: number;
  workers_hired: number;
  start_date: string;
  start_time: string;
  end_time: string;
  daily_wage: number;
  overtime_rate: number;
  duration: string;
  food: boolean;
  transport: boolean;
  other_facilities: string | null;
  created_at: string;
  distance_km: number | null;
  already_applied: boolean;
  application_status: string | null;
}

export interface WorkerSearchRow {
  availability_id: string;
  worker_id: string;
  name: string;
  photo: string | null;
  area: string | null;
  skill_id: string | null;
  skill: string | null;
  skill_hi: string | null;
  icon: string | null;
  rating: number | null;
  rating_count: number | null;
  experience: number | null;
  expected_wage: number;
  radius: number;
  available_from: string;
  available_until: string;
  available_time: string | null;
  job_type: string;
  completed_jobs: number | null;
  work_score: number | null;
  verification_status: string | null;
  distance_km: number | null;
}

export interface PublicWorkerRow {
  worker_id: string;
  name: string;
  photo: string | null;
  area: string | null;
  skill: string | null;
  skill_hi: string | null;
  icon: string | null;
  rating: number | null;
  experience: number | null;
  expected_wage: number;
  available_until: string;
  latitude: number | null;
  longitude: number | null;
}

export type ApplicationStatus =
  | 'applied'
  | 'shortlisted'
  | 'invited'
  | 'accepted'
  | 'rejected'
  | 'cancelled';

export interface Application {
  id: string;
  job_id: string;
  worker_id: string;
  employer_id: string;
  source: 'worker_applied' | 'employer_invited';
  status: ApplicationStatus;
  message: string | null;
  applied_at: string;
}

export interface Hire {
  id: string;
  job_id: string;
  worker_id: string;
  employer_id: string;
  skill_id: string | null;
  work_date: string;
  daily_wage: number;
  overtime_rate: number;
  scheduled_in: string;
  scheduled_out: string;
  hired_at: string;
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'disputed';
}

export type AttendanceStatus =
  | 'not_started'
  | 'pending_in'
  | 'present'
  | 'pending_out'
  | 'completed'
  | 'absent'
  | 'disputed';

export interface Attendance {
  id: string;
  hire_id: string;
  worker_id: string;
  employer_id: string;
  date: string;
  scheduled_in: string;
  scheduled_out: string;
  daily_wage: number;
  overtime_rate: number;
  worker_in: string | null;
  employer_in: string | null;
  worker_out: string | null;
  employer_out: string | null;
  attendance_status: AttendanceStatus;
  confirmed_in: string | null;
  confirmed_out: string | null;
  regular_hours: number;
  overtime_hours: number;
  total_hours: number;
  overtime_amount: number;
  total_wage: number;
  is_locked: boolean;
}

export interface Payment {
  id: string;
  hire_id: string;
  attendance_id: string | null;
  job_id: string | null;
  worker_id: string;
  employer_id: string;
  amount: number;
  paid_amount: number;
  status: 'pending' | 'partial' | 'paid' | 'disputed';
  method: string;
  payment_date: string | null;
  reference: string | null;
  note: string | null;
  created_at: string;
}

export interface Review {
  id: string;
  job_id: string;
  hire_id: string;
  reviewer_id: string;
  reviewed_user_id: string;
  reviewer_role: 'worker' | 'employer';
  rating: number;
  categories: Record<string, number>;
  review: string | null;
  /** photo of the completed work, attached by the employer when rating (public URL) */
  work_photo?: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  job_id: string | null;
  message: string;
  message_type: 'text' | 'image';
  attachment_url: string | null;
  read_at: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  read_status: boolean;
  created_at: string;
}

export interface Dispute {
  id: string;
  job_id: string | null;
  hire_id: string | null;
  attendance_id: string | null;
  raised_by: string;
  against_user: string | null;
  type: string;
  description: string;
  evidence: string | null;
  status: 'open' | 'under_review' | 'resolved' | 'rejected';
  resolution: string | null;
  created_at: string;
}

export interface PortfolioItem {
  id: string;
  worker_id: string;
  file_url: string;
  file_key: string | null;
  kind: 'work_photo' | 'certificate' | 'skill_proof' | 'identity';
  title: string | null;
  description: string | null;
  is_public: boolean;
  created_at: string;
}

export interface PlatformStats {
  registered_workers: number;
  active_workers: number;
  active_jobs: number;
  completed_jobs: number;
  registered_employers: number;
}
