# Repairs the six member logins: active status, cleared lockout, password set the
# proper (validated) way so authentication works. Then tests a login.
ActiveRecord::Base.logger = nil
pw = 'Attest!2026'
logins = %w[rath mai senghak chandy kimheng ranut]

logins.each do |login|
  u = User.find_by(login: login)
  unless u
    puts "#{login}: NOT FOUND"
    next
  end
  begin; u.status = :active; rescue StandardError; u.status = 1; end
  u.failed_login_count = 0 if u.respond_to?(:failed_login_count=)
  u.force_password_change = false if u.respond_to?(:force_password_change=)
  u.password = pw
  u.password_confirmation = pw
  begin
    u.save!
    puts "#{login}: saved (active?=#{u.active?})"
  rescue => e
    puts "#{login}: SAVE ERR -> #{e.message}"
  end
end

puts '--- login tests ---'
logins.each do |login|
  res = begin
    User.try_to_login(login, pw)
  rescue StandardError => e
    "ERR #{e.message}"
  end
  puts "#{login}: #{res.is_a?(User) ? 'SUCCESS' : res.inspect}"
end
