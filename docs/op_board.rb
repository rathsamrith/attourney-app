# Creates a Basic board "Attest Scrum Board" with five lists, one per status column,
# each backed by a status-filtered query. Community-safe (no Enterprise action board).
ActiveRecord::Base.logger = nil
pr = Project.find_by(identifier: 'attest') or abort 'no attest project'
admin = User.where(admin: true).where.not(login: nil).first
columns = ['Data Collection Backlog', 'Design', 'Implementation', 'Testing', 'Deployment']

# 1. One status-filtered query per column
queries = columns.map do |name|
  st = Status.find_by(name: name)
  q = Query.find_by(name: name, project_id: pr.id) || Query.new(project: pr, name: name, user: admin)
  q.public = true
  q.show_hierarchies = false
  q.include_subprojects = false
  q.display_sums = false
  q.display_representation = 'cards' if q.respond_to?(:display_representation=)
  q.filters = []
  q.add_filter('status_id', '=', [st.id.to_s])
  q.save!(validate: false)
  q
end
puts 'queries: ' + queries.map(&:id).inspect

# 2. (Re)create the board grid
old = Boards::Grid.where(project_id: pr.id, name: 'Attest Scrum Board')
old.each { |g| g.widgets.destroy_all; g.destroy }

board = Boards::Grid.new(project: pr, name: 'Attest Scrum Board',
                         row_count: 1, column_count: columns.length,
                         user_id: admin.id, options: { 'type' => 'free' })
queries.each_with_index do |q, i|
  board.widgets.build(identifier: 'work_package_query',
                      start_row: 1, end_row: 2,
                      start_column: i + 1, end_column: i + 2,
                      options: { 'queryId' => q.id, 'name' => q.name })
end
board.save!(validate: false)
puts "DONE board_id=#{board.id} widgets=#{board.widgets.count} columns=#{columns.length}"
