# Builds the Sprint -> Epic -> User Story -> Task hierarchy in the Attest project.
# Sprints (versions) and Epics already exist. This inserts one User Story under each
# Epic and re-parents that Epic's Tasks beneath the story. Idempotent.
ActiveRecord::Base.logger = nil

pr = Project.find_by(identifier: 'attest') or abort 'no attest project'
admin = User.where(admin: true).where.not(login: nil).first

# --- types ---
epic_type = Type.find_by(name: 'Epic')
task_type = Type.find_by(name: 'Task')
us_type   = Type.find_by(name: 'User story') || Type.find_by(name: 'User Story')
if us_type.nil?
  us_type = Type.create!(name: 'User story', is_default: false, is_milestone: false,
                         position: (Type.maximum(:position).to_i + 1))
end
pr.types = (pr.types.to_a + [us_type]).uniq
pr.save!

default_status = Status.where(is_default: true).first || Status.find_by(name: 'New') || Status.first
prio = IssuePriority.where(is_default: true).first || IssuePriority.first

# Epic subject => [assignee login, user-story statement]
stories = {
  'Check-in & Identity Verification'   => ['rath',    'As a participant, I want to complete remote check-in and identity verification so that I can be admitted to the hearing.'],
  'Live Proceeding & Transcript'       => ['chandy',  'As a presiding adjudicator, I want to run the live proceeding with transcript and objections so that an accurate on-the-record account is kept.'],
  'Exhibits Management'                => ['mai',     'As counsel, I want to offer, rule on and publish exhibits so that evidence is handled with the correct side visibility.'],
  'Sealed Deliberation & Voting'       => ['senghak', 'As a panelist, I want to cast a sealed ballot so that votes stay secret until the whole panel reveals together.'],
  'Record Sealing & Certified Export'  => ['senghak', 'As a record officer, I want to seal and certify the record so that its integrity can be independently proven.'],
  'Audit Trail & Realtime'             => ['kimheng', 'As an auditor, I want a tamper-evident audit trail with live updates so that every action is traceable.'],
  'Docket & Notifications'             => ['kimheng', 'As a user, I want a docket and role-based notifications so that I stay informed about my sessions.'],
  'Auth, Roles & Permissions'          => ['senghak', 'As an administrator, I want role-based access enforced so that each person sees only what they are allowed to.'],
  'Vendor Integrations (Providers)'    => ['mai',     'As the platform, I want production vendor adapters so that identity, certificates, signing and storage are real.'],
  'Infrastructure, CI/CD & Deployment' => ['ranut',   'As a developer, I want a reproducible build, test and deploy pipeline so that releases are reliable.'],
}

created = 0
reparented = 0
WorkPackage.where(project_id: pr.id, type_id: epic_type.id).find_each do |epic|
  login, stmt = stories[epic.subject]
  lead = login ? User.find_by(login: login) : epic.assigned_to

  tasks = WorkPackage.where(project_id: pr.id, parent_id: epic.id, type_id: task_type.id).to_a
  sprint = tasks.map(&:version).compact.min_by { |v| v.start_date || Date.new(2100) }

  subject = 'US: ' + epic.subject
  us = WorkPackage.find_by(project_id: pr.id, type_id: us_type.id, subject: subject) ||
       WorkPackage.new(project: pr, type: us_type, subject: subject)
  us.description = stmt || ('User story for ' + epic.subject)
  us.status = default_status
  us.author = admin
  us.priority = prio
  us.assigned_to = lead if lead
  us.parent = epic
  us.version = sprint if sprint
  us.save!(validate: false)
  created += 1

  tasks.each do |t|
    next if t.parent_id == us.id
    t.parent = us
    t.save!(validate: false)
    reparented += 1
  end
end

puts "DONE user_stories=#{created} tasks_reparented=#{reparented}"
