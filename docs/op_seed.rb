# Seeds the Attest project into OpenProject: 6 members, 10 Epics (modules),
# 30 tasks (functions), 5 board statuses (columns), 4 sprints, all assigned.
# Idempotent: safe to run more than once. Uses save!(validate: false) to bypass
# workflow/permission checks during seeding.
ActiveRecord::Base.logger = nil

admin = User.where(admin: true).where.not(login: nil).first
raise "no admin user found" unless admin

# ---- 1. Members ----
members = {
  'rath'    => ['Rath',   'Samrith', 'rath@attest.local'],
  'mai'     => ['Mai',    'Samorn',  'mai@attest.local'],
  'senghak' => ['Chhun',  'Senghak', 'senghak@attest.local'],
  'chandy'  => ['Chandy', 'Moeun',   'chandy@attest.local'],
  'kimheng' => ['Chhim',  'Kimheng', 'kimheng@attest.local'],
  'ranut'   => ['Hort',   'Ranut',   'ranut@attest.local'],
}
users = {}
members.each do |login, (fn, ln, mail)|
  u = User.find_by(login: login) || User.new(login: login)
  u.firstname = fn; u.lastname = ln; u.mail = mail; u.admin = false; u.language = 'en'
  begin; u.status = :active; rescue StandardError; u.status = 1; end
  u.force_password_change = false if u.respond_to?(:force_password_change=)
  u.password = 'Attest!2026'
  u.password_confirmation = 'Attest!2026'
  # Validated save persists the password (validate: false skips the password table).
  begin
    u.save!
  rescue StandardError => e
    u.save!(validate: false)
    puts "user #{login}: saved without validation (#{e.message})"
  end
  users[login] = u
end

# ---- 2. Statuses = board columns ----
columns = ['Data Collection Backlog', 'Design', 'Implementation', 'Testing', 'Deployment']
status = {}
columns.each_with_index do |name, i|
  status[name] = Status.find_by(name: name) ||
                 Status.create!(name: name, default_done_ratio: 0, is_closed: false, is_default: false)
end
default_status = Status.where(is_default: true).first || Status.find_by(name: 'New') || Status.first

# ---- 3. Types ----
task_type = Type.find_by(name: 'Task') || Type.first
epic_type = Type.find_by(name: 'Epic')
if epic_type.nil?
  begin
    epic_type = Type.create!(name: 'Epic', is_default: false, is_milestone: false,
                             position: (Type.maximum(:position).to_i + 1))
  rescue StandardError => e
    puts "Epic type create failed (#{e.message}); using Task type for modules."
    epic_type = task_type
  end
end

# ---- 4. Project ----
project = Project.find_by(identifier: 'attest') ||
          Project.create!(name: 'Attest', identifier: 'attest', workspace_type: 'project',
                          description: 'Remote hearing management - course project (Stage III).')
project.types = [epic_type, task_type].uniq.compact
project.save!

# ---- 5. Memberships ----
role = Role.givable.find_by(name: 'Project admin') || Role.givable.first
([admin] + users.values).uniq.each do |u|
  m = Member.find_by(user_id: u.id, project_id: project.id) || Member.new(principal: u, project: project)
  m.roles = [role] if m.roles.to_a.empty?
  m.save!
end

# ---- 6. Sprints (versions) ----
sprints = [
  ['Sprint 1 - Data Collection & Design', '2026-10-20', '2026-10-26'],
  ['Sprint 2 - Implementation',           '2026-10-27', '2026-11-02'],
  ['Sprint 3 - Testing',                  '2026-11-03', '2026-11-09'],
  ['Sprint 4 - Deployment & Submission',  '2026-11-10', '2026-11-13'],
]
version = {}
sprints.each do |name, sd, ed|
  version[name] = Version.find_by(name: name, project_id: project.id) ||
                  Version.create!(project: project, name: name, start_date: sd, effective_date: ed, status: 'open')
end
sprint_names = sprints.map { |s| s[0] }
prio = IssuePriority.where(is_default: true).first || IssuePriority.first

def upsert_wp(project, type, subject, status, author, assignee, parent, version, prio)
  w = WorkPackage.find_by(project_id: project.id, subject: subject) ||
      WorkPackage.new(project: project, subject: subject)
  w.type = type; w.status = status; w.author = author; w.priority = prio
  w.assigned_to = assignee if assignee
  w.parent = parent if parent
  w.version = version if version
  w.save!(validate: false)
  w
end

# ---- 7. Epics (modules) ----
epics = [
  ['Check-in & Identity',      'Check-in & Identity Verification',    'rath'],
  ['Live Proceeding',          'Live Proceeding & Transcript',        'chandy'],
  ['Exhibits',                 'Exhibits Management',                 'mai'],
  ['Deliberation',             'Sealed Deliberation & Voting',        'senghak'],
  ['Record Sealing',           'Record Sealing & Certified Export',   'senghak'],
  ['Audit & Realtime',         'Audit Trail & Realtime',              'kimheng'],
  ['Docket & Notifications',   'Docket & Notifications',              'kimheng'],
  ['Auth & Permissions',       'Auth, Roles & Permissions',           'senghak'],
  ['Vendor Integrations',      'Vendor Integrations (Providers)',      'mai'],
  ['Infrastructure & CI/CD',   'Infrastructure, CI/CD & Deployment',   'ranut'],
]
epic_wp = {}
epics.each do |short, full, lead|
  epic_wp[short] = upsert_wp(project, epic_type, full, default_status, admin, users[lead], nil, nil, prio)
end

# ---- 8. Tasks (functions): [subject, epic, assignee, column, sprint index] ----
tasks = [
  ['Gather hearing & identity verification requirements', 'Check-in & Identity', 'rath',    'Data Collection Backlog', 0],
  ['Research face-match & OCSP certificate vendors',       'Vendor Integrations', 'mai',     'Data Collection Backlog', 0],
  ['Define ERD: matters, sessions, participants, audit',   'Audit & Realtime',    'kimheng', 'Data Collection Backlog', 0],
  ['Document rule set R1-R8 and permission matrix',        'Auth & Permissions',  'senghak', 'Data Collection Backlog', 0],
  ['Collect EN/KM localization strings & glossary',        'Docket & Notifications','chandy','Data Collection Backlog', 0],
  ['Inventory infra: Keycloak, LiveKit, Postgres, Redis',  'Infrastructure & CI/CD','ranut', 'Data Collection Backlog', 0],
  ['Design check-in & identity UX flow',                   'Check-in & Identity', 'rath',    'Design', 0],
  ['Design exhibit lifecycle & storage model',             'Exhibits',            'mai',     'Design', 0],
  ['Design sealed-ballot deliberation scheme',             'Deliberation',        'senghak', 'Design', 0],
  ['Design transcript & objections UI panels',             'Live Proceeding',     'chandy',  'Design', 0],
  ['Design audit hash-chain & realtime event model',       'Audit & Realtime',    'kimheng', 'Design', 0],
  ['Design CI/CD pipeline & Docker topology',              'Infrastructure & CI/CD','ranut',  'Design', 0],
  ['Implement real face-match adapter',                    'Vendor Integrations', 'rath',    'Implementation', 1],
  ['Implement OCSP validator & S3 storage adapters',       'Vendor Integrations', 'mai',     'Implementation', 1],
  ['Implement HSM signer & RFC 3161 timestamp',            'Record Sealing',      'senghak', 'Implementation', 1],
  ['Implement transcript, objections & exhibits UI',       'Live Proceeding',     'chandy',  'Implementation', 1],
  ['Implement NotificationsModule & notifications',        'Docket & Notifications','kimheng','Implementation', 1],
  ['Implement one-command Dockerized stack',               'Infrastructure & CI/CD','ranut',  'Implementation', 1],
  ['Write unit & e2e tests for check-in/identity',         'Check-in & Identity', 'rath',    'Testing', 2],
  ['Write tests for exhibits & storage',                   'Exhibits',            'mai',     'Testing', 2],
  ['Verify deliberation reveal & record seal',             'Record Sealing',      'senghak', 'Testing', 2],
  ['Vitest + RTL coverage for 8 feature pages',            'Live Proceeding',     'chandy',  'Testing', 2],
  ['Write backend unit tests for thin modules',            'Audit & Realtime',    'kimheng', 'Testing', 2],
  ['Set up CI test pipeline: lint + unit + e2e',           'Infrastructure & CI/CD','ranut',  'Testing', 2],
  ['Keycloak realm hardening & secrets management',        'Auth & Permissions',  'senghak', 'Deployment', 3],
  ['Deploy backend container with migrate + seed',         'Infrastructure & CI/CD','kimheng','Deployment', 3],
  ['Deploy frontend (nginx) & LiveKit config',             'Infrastructure & CI/CD','ranut',  'Deployment', 3],
  ['Swap providers to production (useClass)',              'Vendor Integrations', 'mai',     'Deployment', 3],
  ['Staging smoke test & Stage III sign-off',             'Check-in & Identity', 'rath',    'Deployment', 3],
  ['Write release notes & user documentation',             'Docket & Notifications','chandy', 'Deployment', 3],
]
tasks.each do |subj, epic, akey, col, sidx|
  upsert_wp(project, task_type, subj, status[col], admin, users[akey], epic_wp[epic], version[sprint_names[sidx]], prio)
end

puts "DONE project=#{project.identifier} users=#{users.size} statuses=#{status.size} sprints=#{version.size} epics=#{epic_wp.size} tasks=#{tasks.size}"
