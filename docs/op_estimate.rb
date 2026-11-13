# Applies estimation: Estimated time (hours) on every Task, and Story points on each
# User Story (sum of its child tasks' points). Idempotent. Hours = points x 4.
ActiveRecord::Base.logger = nil
pr = Project.find_by(identifier: 'attest') or abort 'no attest project'
task_t = Type.find_by(name: 'Task')
us_t   = Type.find_by(name: 'User story')
HPP = 4  # hours per story point

points = {
  'Gather hearing & identity verification requirements' => 3,
  'Research face-match & OCSP certificate vendors' => 3,
  'Define ERD: matters, sessions, participants, audit' => 5,
  'Document rule set R1-R8 and permission matrix' => 3,
  'Collect EN/KM localization strings & glossary' => 2,
  'Inventory infra: Keycloak, LiveKit, Postgres, Redis' => 3,
  'Design check-in & identity UX flow' => 3,
  'Design exhibit lifecycle & storage model' => 3,
  'Design sealed-ballot deliberation scheme' => 5,
  'Design transcript & objections UI panels' => 3,
  'Design audit hash-chain & realtime event model' => 3,
  'Design CI/CD pipeline & Docker topology' => 3,
  'Implement real face-match adapter' => 5,
  'Implement OCSP validator & S3 storage adapters' => 5,
  'Implement HSM signer & RFC 3161 timestamp' => 5,
  'Implement transcript, objections & exhibits UI' => 5,
  'Implement NotificationsModule & notifications' => 3,
  'Implement one-command Dockerized stack' => 5,
  'Write unit & e2e tests for check-in/identity' => 3,
  'Write tests for exhibits & storage' => 3,
  'Verify deliberation reveal & record seal' => 5,
  'Vitest + RTL coverage for 8 feature pages' => 5,
  'Write backend unit tests for thin modules' => 5,
  'Set up CI test pipeline: lint + unit + e2e' => 3,
  'Keycloak realm hardening & secrets management' => 3,
  'Deploy backend container with migrate + seed' => 3,
  'Deploy frontend (nginx) & LiveKit config' => 3,
  'Swap providers to production (useClass)' => 2,
  'Staging smoke test & Stage III sign-off' => 3,
  'Write release notes & user documentation' => 2,
}

tasks_done = 0
WorkPackage.where(project_id: pr.id, type_id: task_t.id).find_each do |t|
  pt = points[t.subject]
  next unless pt
  hrs = pt * HPP
  t.estimated_hours = hrs
  t.remaining_hours = hrs if t.respond_to?(:remaining_hours=)
  t.story_points = pt if t.respond_to?(:story_points=)
  t.save!(validate: false)
  tasks_done += 1
end

stories_done = 0
WorkPackage.where(project_id: pr.id, type_id: us_t.id).find_each do |us|
  child_pts = WorkPackage.where(parent_id: us.id, type_id: task_t.id).to_a.sum { |c| points[c.subject].to_i }
  us.story_points = child_pts if us.respond_to?(:story_points=)
  us.estimated_hours = child_pts * HPP
  us.save!(validate: false)
  stories_done += 1
end

puts "DONE tasks_estimated=#{tasks_done} total_points=#{points.values.sum} total_hours=#{points.values.sum * HPP} stories_pointed=#{stories_done}"
