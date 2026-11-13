# Turns on the Scrum/Backlogs + Boards modules for the Attest project and makes the
# four sprints show in the backlog (and their task boards). Idempotent.
ActiveRecord::Base.logger = nil
pr = Project.find_by(identifier: 'attest') or abort 'no attest project'

defaults = (Setting.respond_to?(:default_projects_modules) ? Setting.default_projects_modules : []) || []
pr.enabled_module_names = (defaults + pr.enabled_module_names + %w[work_package_tracking backlogs board_view]).uniq
pr.save!
puts 'enabled modules: ' + pr.reload.enabled_module_names.sort.join(', ')

# Show each sprint in the backlogs "sprints" column (DISPLAY_LEFT = 2).
Version.where(project_id: pr.id).find_each do |v|
  vs = VersionSetting.find_or_initialize_by(project_id: pr.id, version_id: v.id)
  vs.display = VersionSetting::DISPLAY_LEFT
  vs.save!
end
puts 'sprints shown in backlog: ' + Version.where(project_id: pr.id).count.to_s
puts 'DONE'
