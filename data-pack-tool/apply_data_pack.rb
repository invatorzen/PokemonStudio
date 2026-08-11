# Pokemon Studio Data Pack Installer
#
# Interactively (or via flags) installs a generation/version data pack from the
# invatorzen/GameDataPacks fork into the current Pokemon Studio /
# PSDK project. Mirrors the manual steps in that repo's README:
#   1. Wipe Data/Studio/dex (old dex filenames clash with the pack)
#   2. Copy audio/, Data/, graphics/ from the chosen version folder, overwriting
#
# A timestamped backup of overwritten folders is written to
# tools/data_pack_backups/<timestamp>/ before anything is touched.
#
# Usage:
#   ruby tools/apply_data_pack.rb
#   ruby tools/apply_data_pack.rb --local "C:\path\to\GameDataPacks" --gen 3 --version emerald --yes
#   ruby tools/apply_data_pack.rb --remote --gen 9 --version scarlet-violet

require 'fileutils'
require 'tmpdir'
require 'optparse'
require 'set'
require 'json'
require 'csv'
require 'time'

REPO_GIT_URL = 'https://github.com/invatorzen/GameDataPacks.git'.freeze

# Hard-coded list mirrors the repo's folder structure so we don't need a
# network call just to render the menu.
GENERATIONS = {
  1 => ['red-green-blue-yellow'],
  2 => ['gold-silver', 'crystal'],
  3 => ['ruby-sapphire', 'firered-leafgreen', 'emerald'],
  4 => ['diamond-pearl', 'platinum', 'heartgold-soulsilver'],
  5 => ['black-white', 'black-2-white-2'],
  6 => ['x-y', 'omega-ruby-alpha-sapphire'],
  7 => ['sun-moon', 'ultra-sun-ultra-moon'],
  8 => ['sword-shield'],
  9 => ['scarlet-violet', 'Legends Z-A']
}.freeze

# Folders inside the project that the pack overwrites. Used for backup.
BACKUP_TARGETS = [
  'Data/Studio',
  'Data/Text',
  'audio/se/cries',
  'graphics/characters',
  'graphics/icons',
  'graphics/pokedex'
].freeze

# Each category names the pack-owned folders that should be MIRRORED (project
# files not in the pack are deleted, then the pack files are copied in) and the
# mixed-ownership folders that should only be OVERWRITTEN file-by-file.
# Folders not listed in any category are ignored.
CATEGORIES = {
  pokemon: {
    label: 'Pokémon (data, dex, cries, battle sprites, overworlds)',
    data_dir: 'Data/Studio/pokemon',
    mirror: %w[
      Data/Studio/pokemon
      Data/Studio/dex
      audio/se/cries
      graphics/pokedex/footprints
      graphics/pokedex/pokeback
      graphics/pokedex/pokebackshiny
      graphics/pokedex/pokefront
      graphics/pokedex/pokefrontshiny
      graphics/pokedex/pokeicon
      graphics/pokedex/pokeiconshiny
    ],
    copy_only: %w[graphics/characters]
  },
  moves: { label: 'Moves', data_dir: 'Data/Studio/moves', mirror: %w[Data/Studio/moves], copy_only: [] },
  items: { label: 'Items (data + icons)', data_dir: 'Data/Studio/items', mirror: %w[Data/Studio/items], copy_only: %w[graphics/icons] },
  abilities: { label: 'Abilities', data_dir: 'Data/Studio/abilities', mirror: %w[Data/Studio/abilities], copy_only: [] },
  types: { label: 'Types', data_dir: 'Data/Studio/types', mirror: %w[Data/Studio/types], copy_only: [] }
}.freeze

# Always copied (overwrite-only) when any category is selected. Holds the names
# / descriptions CSVs the rest of the data references.
TEXT_DIR = 'Data/Text'.freeze
TEXT_DIALOGS_DIR = 'Data/Text/Dialogs'.freeze

# CSV files in Data/Text/Dialogs/ that are indexed by an entity's id.
# `id_field` is the JSON field that drives the CSV row position.
#   - pokemon/moves/items: `id` itself
#   - abilities/types: a separate `textId` field (we renumber it alongside `id`)
# `csv_row_offset` accounts for the header row + any leading placeholder
# (e.g. "Egg" in 100000.csv) — CSV row = entity[id_field] + csv_row_offset.
TEXT_CONFIG = {
  pokemon: { id_field: 'id', csv_row_offset: 1, csvs: %w[100000 100001 100002] },
  moves: { id_field: 'id', csv_row_offset: 1, csvs: %w[100006 100007 100072] },
  items: { id_field: 'id', csv_row_offset: 1, csvs: %w[100012 100013] },
  abilities: { id_field: 'textId', csv_row_offset: 1, csvs: %w[100004 100005] },
  types: { id_field: 'textId', csv_row_offset: 1, csvs: %w[100003] }
}.freeze

# CSV files indexed by an `id` *other than* the entity's main id (e.g. forms
# point at rows via formTextId.name / .description). Row-level merged but never
# renumbered.
FORM_CSVS_BY_CATEGORY = {
  pokemon: %w[100067 100068]           # form names, form pokédex entries
}.freeze

CATEGORY_KEYS = CATEGORIES.keys.freeze

MAX_BACKUPS = 5

# Per-pack manifest filename inside `Gen N/<version>/`. Committed in the
# GameDataPacks repo. Lists pack symbols, max ids, formTextId maxes, and CSV
# row counts so we don't have to scan every JSON at runtime.
PACK_MANIFEST_FILENAME = 'manifest.json'.freeze

def parse_options
  opts = { mode: nil, path: nil, gen: nil, version: nil, yes: false, scope: nil,
           from_gen: nil, from_version: nil, dry_run: false }
  OptionParser.new do |o|
    o.banner = 'Usage: ruby tools/apply_data_pack.rb [options]'
    o.on('--local PATH', 'Use a local clone of GameDataPacks at PATH') { |v| opts[:mode] = :local; opts[:path] = v }
    o.on('--remote', 'Download the pack from GitHub') { opts[:mode] = :remote }
    o.on('--gen N', Integer, 'Generation number to switch to / install (1-9)') { |v| opts[:gen] = v }
    o.on('--version NAME', 'Version folder name (e.g. emerald)') { |v| opts[:version] = v }
    o.on('--from-gen N', Integer, 'Switch strategy: gen to migrate FROM (1-9)') { |v| opts[:from_gen] = v }
    o.on('--from-version NAME', 'Switch strategy: version to migrate FROM') { |v| opts[:from_version] = v }
    o.on('--scope LIST', "Comma-separated categories: all, #{CATEGORY_KEYS.join(', ')}") { |v| opts[:scope] = v }
    o.on('--strategy NAME', 'overwrite (default), merge, or switch') { |v| opts[:strategy] = v }
    o.on('--yes', 'Skip confirmation prompt') { opts[:yes] = true }
    o.on('--dry-run', 'Print the plan and switch preview, then exit without changing anything') { opts[:dry_run] = true }
    o.on('-h', '--help') { puts o; exit }
  end.parse!
  opts
end

def prompt(msg, default = nil)
  print "#{msg}: "
  input = $stdin.gets&.chomp
  input = nil if input == ''
  input || default
end

# Returns true if `dir` looks like a Pokemon Studio project root.
def studio_project_root?(dir)
  File.exist?(File.join(dir, 'project.studio')) && Dir.exist?(File.join(dir, 'Data', 'Studio'))
end

# Walks up looking for project.studio, from the working directory first (so a
# host like Pokémon Studio can point us at the project by launching us with its
# cwd) and then from the script's own location (the double-click-in-tools case).
# If neither finds one, prompts the user for a path instead of aborting.
def chdir_to_project_root!
  [Dir.pwd, File.expand_path(__dir__)].each do |start|
    dir = start
    5.times do
      if studio_project_root?(dir)
        Dir.chdir(dir)
        return
      end
      parent = File.dirname(dir)
      break if parent == dir

      dir = parent
    end
  end

  puts 'Could not find a Pokemon Studio project root (no project.studio / Data/Studio above this script).'
  loop do
    raw = prompt('Path to your Pokemon Studio project folder')
    abort 'Aborted.' if raw.nil? || raw.strip.empty?

    candidate = normalize_local_path(raw)
    if Dir.exist?(candidate) && studio_project_root?(candidate)
      Dir.chdir(candidate)
      return
    end

    if !Dir.exist?(candidate)
      puts "That path does not exist: #{candidate}"
    else
      puts "That folder does not look like a Pokemon Studio project (no project.studio / Data/Studio inside)."
    end
    puts 'Please try again.'
  end
end

def choose_source(opts)
  if opts[:mode].nil?
    puts 'Datapack source:'
    puts '  1 - Download from GitHub (latest main)'
    puts '  2 - Use a local clone of GameDataPacks'
    choice = prompt('Choice', '1')
    opts[:mode] = choice == '2' ? :local : :remote
  end

  if opts[:mode] == :local
    opts[:path] = normalize_local_path(opts[:path]) if opts[:path]

    until opts[:path] && Dir.exist?(opts[:path])
      if opts[:path]
        puts "Could not find that path: #{opts[:path]}"
        puts 'Please try again.'
      end
      raw = prompt('Path to local GameDataPacks folder')
      opts[:path] = raw && normalize_local_path(raw)
    end
  end
end

# Cleans up a user-entered path: strips surrounding whitespace/quotes (Windows
# Explorer's "Copy as path" wraps in double quotes) and converts \ to / so
# Dir.glob behaves on Windows.
def normalize_local_path(raw)
  s = raw.to_s.strip
  s = s[1..-2] if s.length >= 2 && ((s.start_with?('"') && s.end_with?('"')) || (s.start_with?("'") && s.end_with?("'")))
  s.tr('\\', '/')
end

# Resolves opts[:scope] to a list of category keys. Accepts "all" or a
# comma-separated list of keys. If nil, prompts interactively.
def choose_scope(opts)
  if opts[:scope]
    parts = opts[:scope].downcase.split(',').map(&:strip)
    return CATEGORY_KEYS.dup if parts.include?('all')

    selected = parts.map(&:to_sym)
    unknown = selected - CATEGORY_KEYS
    abort "ERROR: unknown scope categories: #{unknown.join(', ')} (valid: all, #{CATEGORY_KEYS.join(', ')})" if unknown.any?

    return selected
  end

  puts "\nWhat do you want to update from this pack?"
  puts '  1 - Everything (recommended for fresh projects)'
  CATEGORY_KEYS.each_with_index { |k, i| puts "  #{i + 2} - #{CATEGORIES[k][:label]}" }
  individual_idx = CATEGORY_KEYS.size + 2
  cancel_idx = CATEGORY_KEYS.size + 3
  puts "  #{individual_idx} - Choose individually"
  puts "  #{cancel_idx} - Cancel"

  choice = (prompt('Choice', '1') || '1').to_i

  return CATEGORY_KEYS.dup if choice == 1
  abort 'Cancelled.' if choice == cancel_idx

  if choice == individual_idx
    puts "\nEnter the numbers of the categories to update, separated by spaces:"
    CATEGORY_KEYS.each_with_index { |k, i| puts "  #{i + 1} - #{CATEGORIES[k][:label]}" }
    raw = prompt('Your choices') || ''
    nums = raw.split.map(&:to_i).reject(&:zero?)
    abort 'ERROR: no valid categories selected.' if nums.empty?

    selected = nums.map { |n| CATEGORY_KEYS[n - 1] }.compact.uniq
    abort 'ERROR: no valid categories selected.' if selected.empty?

    return selected
  end

  cat_idx = choice - 2
  abort 'ERROR: invalid choice' unless cat_idx.between?(0, CATEGORY_KEYS.size - 1)

  [CATEGORY_KEYS[cat_idx]]
end

STRATEGIES = %i[overwrite switch].freeze

def choose_strategy(opts)
  if opts[:strategy]
    sym = opts[:strategy].downcase.to_sym
    abort "ERROR: unknown strategy: #{opts[:strategy]} (valid: #{STRATEGIES.join(', ')})" unless STRATEGIES.include?(sym)

    return sym
  end

  puts "\nHow do you want to apply the data pack?"
  puts '  1 - Overwrite all data (faster, recommended for fresh projects)'
  puts '      Mirrors pack-owned folders. Project entries not in the pack are deleted.'
  puts '  2 - Switch current data with another data pack (protects custom content)'
  puts '      Anything in your project that was not in the FROM pack is treated as'
  puts '      custom and carried over into the TO pack. Shows a preview before applying.'
  choice = prompt('Choice').to_i
  case choice
  when 1 then :overwrite
  when 2 then :switch
  else abort 'ERROR: invalid choice'
  end
end

def choose_gen_version(opts, gen_prompt: nil, version_prompt: nil)
  gen_prompt ||= 'Pick a generation:'
  if opts[:gen].nil?
    puts "\n#{gen_prompt}"
    GENERATIONS.each_key { |g| puts "  #{g} - Gen #{g}" }
    opts[:gen] = prompt('Choice').to_i
  end
  versions = GENERATIONS[opts[:gen]] or abort "ERROR: unknown generation #{opts[:gen]}"

  version_prompt ||= "Which version from gen #{opts[:gen]}:"
  if opts[:version].nil?
    if versions.size == 1
      opts[:version] = versions.first
      puts "Only one version for Gen #{opts[:gen]}: #{opts[:version]}"
    else
      puts "\n#{version_prompt}"
      versions.each_with_index { |v, i| puts "  #{i + 1} - #{v}" }
      idx = prompt('Choice').to_i
      abort 'ERROR: invalid choice' unless idx.between?(1, versions.size)
      opts[:version] = versions[idx - 1]
    end
  else
    abort "ERROR: version '#{opts[:version]}' not in Gen #{opts[:gen]} (#{versions.join(', ')})" unless versions.include?(opts[:version])
  end
end

# Asks the user for the FROM gen + version (the gen the project currently
# tracks). Sets opts[:from_gen] and opts[:from_version] in place.
def choose_switch_gens(opts)
  from_opts = { gen: opts[:from_gen], version: opts[:from_version] }
  choose_gen_version(from_opts, gen_prompt: 'Pick your current datapack generation:')
  opts[:from_gen] = from_opts[:gen]
  opts[:from_version] = from_opts[:version]

  to_opts = { gen: opts[:gen], version: opts[:version] }
  choose_gen_version(to_opts, gen_prompt: 'Pick a generation to switch to:')
  opts[:gen] = to_opts[:gen]
  opts[:version] = to_opts[:version]

  abort 'ERROR: FROM and TO are the same pack; nothing to switch.' if opts[:from_gen] == opts[:gen] && opts[:from_version] == opts[:version]
end

# Returns the absolute path to the version folder containing audio/, Data/, graphics/.
def resolve_pack_root(opts)
  if opts[:mode] == :local
    File.join(opts[:path], "Gen #{opts[:gen]}", opts[:version])
  else
    sparse_clone(opts)
  end
end

# Returns the absolute path to the FROM-gen pack folder. Only used by the
# switch strategy to load its manifest for custom detection.
def resolve_from_pack_root(opts)
  if opts[:mode] == :local
    File.join(opts[:path], "Gen #{opts[:from_gen]}", opts[:from_version])
  else
    sparse_clone_specific(opts[:from_gen], opts[:from_version])
  end
end

# Sparse-clones a specific gen/version into a temp dir. Used by the switch
# strategy to fetch the FROM pack alongside the TO pack.
def sparse_clone_specific(gen, version)
  abort 'ERROR: git is not installed or not on PATH.' unless git_available?

  tmp = Dir.mktmpdir('gamedatapacks-from-')
  sparse_path = "Gen #{gen}/#{version}"
  puts "\nSparse-cloning FROM pack: #{sparse_path}"

  unless system('git', 'clone', '--depth', '1', '--filter=blob:none', '--sparse', '--progress', REPO_GIT_URL, tmp)
    abort 'ERROR: git clone (FROM) failed.'
  end
  Dir.chdir(tmp) do
    unless system('git', 'sparse-checkout', 'set', '--no-cone', sparse_path)
      abort 'ERROR: git sparse-checkout (FROM) failed.'
    end
  end
  File.join(tmp, "Gen #{gen}", version)
end

def git_available?
  system('git --version', out: File::NULL, err: File::NULL)
end

# Sparse-checkout just the chosen version folder. Way smaller than the full
# repo (only the wanted folder's blobs are downloaded, not all 9 generations).
def sparse_clone(opts)
  abort 'ERROR: git is not installed or not on PATH. Install git, or re-run with --local pointing at an existing clone.' unless git_available?

  tmp = Dir.mktmpdir('gamedatapacks-')
  sparse_path = "Gen #{opts[:gen]}/#{opts[:version]}"

  puts "\nSparse-cloning #{REPO_GIT_URL}"
  puts "  Only fetching: #{sparse_path}"

  unless system('git', 'clone', '--depth', '1', '--filter=blob:none', '--sparse', '--progress', REPO_GIT_URL, tmp)
    abort 'ERROR: git clone failed.'
  end

  Dir.chdir(tmp) do
    unless system('git', 'sparse-checkout', 'set', '--no-cone', sparse_path)
      abort 'ERROR: git sparse-checkout failed.'
    end
  end

  pack_root = File.join(tmp, "Gen #{opts[:gen]}", opts[:version])
  abort "ERROR: sparse checkout did not produce #{pack_root}. Check the gen/version names." unless Dir.exist?(pack_root)

  pack_root
end

def backup_folder
  File.join('tools', 'data_pack_backups', Time.now.strftime('%Y-%m-%d_%H-%M-%S'))
end

def prune_old_backups
  root = File.join('tools', 'data_pack_backups')
  return unless Dir.exist?(root)

  dirs = Dir.children(root).map { |c| File.join(root, c) }.select { |p| File.directory?(p) }.sort_by { |p| File.mtime(p) }
  dirs[0...(dirs.size - MAX_BACKUPS)].each { |old| FileUtils.rm_rf(old) } if dirs.size > MAX_BACKUPS
end

def backup_project(dest)
  FileUtils.mkdir_p(dest)
  BACKUP_TARGETS.each do |rel|
    next unless Dir.exist?(rel)

    target = File.join(dest, rel)
    FileUtils.mkdir_p(File.dirname(target))
    FileUtils.cp_r(rel, target)
  end
end

# Removes files in `project_dir` that don't exist in `pack_dir`. Only deletes
# regular files (not subdirectories). Returns the count removed.
def delete_orphans(pack_dir, project_dir)
  return 0 unless Dir.exist?(project_dir)

  pack_names = Dir.exist?(pack_dir) ? Dir.children(pack_dir).to_set : Set.new
  removed = 0
  Dir.children(project_dir).each do |name|
    path = File.join(project_dir, name)
    next if File.directory?(path)
    next if pack_names.include?(name)

    File.delete(path)
    removed += 1
  end
  removed
end

# Copies every file under `pack_subdir` into `project_subdir`, preserving
# relative paths. Prints a single-line progress indicator.
def copy_tree(pack_subdir, project_subdir, label)
  return unless Dir.exist?(pack_subdir)

  entries = Dir.glob(File.join(pack_subdir, '**', '*'), File::FNM_DOTMATCH).reject do |p|
    base = p.sub(/^#{Regexp.escape(pack_subdir)}[\\\/]?/, '')
    base == '' || base.end_with?('.', '..')
  end
  files = entries.reject { |p| File.directory?(p) }
  total = files.size
  return if total.zero?

  puts "  #{label}: #{total} files"
  last_print = 0.0
  files.each_with_index do |src_path, i|
    base = src_path.sub(/^#{Regexp.escape(pack_subdir)}[\\\/]?/, '')
    dst_path = File.join(project_subdir, base)
    FileUtils.mkdir_p(File.dirname(dst_path))
    FileUtils.cp(src_path, dst_path)

    now = Time.now.to_f
    next if now - last_print < 0.05 && i + 1 != total

    last_print = now
    short = base.length > 60 ? "...#{base[-57..]}" : base
    $stdout.print "\r    [#{i + 1}/#{total}] #{short.ljust(60)}"
    $stdout.flush
  end
  puts
end

# Loads every JSON file in `dir` and returns a hash keyed by dbSymbol of
# { path:, data: }. Files that fail to parse or lack a dbSymbol are skipped.
def index_by_db_symbol(dir)
  return {} unless Dir.exist?(dir)

  index = {}
  Dir.glob(File.join(dir, '*.json')).each do |path|
    data = JSON.parse(File.read(path))
    sym = data['dbSymbol']
    index[sym] = { path: path, data: data } if sym
  rescue JSON::ParserError => e
    warn "    (skipping unparseable #{File.basename(path)}: #{e.message})"
  end
  index
end

# --- Manifests ------------------------------------------------------------
#
# Each pack folder (`Gen N/<version>/`) ships a `manifest.json` listing its
# symbols, max ids, formTextId maxes, and CSV row counts. The switch strategy
# also loads the FROM pack's manifest to use its symbol list as the "official"
# reference for identifying project-custom content.
#
# Manifests are generated by `Manifest tool/generate.rb` in the GameDataPacks repo.

def load_pack_manifest(pack_root)
  path = File.join(pack_root, PACK_MANIFEST_FILENAME)
  return nil unless File.exist?(path)

  JSON.parse(File.read(path))
rescue JSON::ParserError => e
  warn "WARNING: pack manifest at #{path} is not valid JSON (#{e.message}); falling back to live scan."
  nil
end

# Returns { category => Set[dbSymbol, ...] } from a pack manifest. Used by
# switch strategy to treat the FROM pack as the "official" reference.
def manifest_pack_symbols(pack_manifest)
  return nil unless pack_manifest

  pack_manifest['categories'].each_with_object({}) do |(cat, entry), h|
    h[cat.to_sym] = (entry['symbols'] || []).to_set
  end
end

# Walks each category and lists project entries that aren't in the official
# set. Returns { category => [dbSymbol, ...] }. The switch strategy shows this
# to the user as a preview before applying anything.
def project_customs_by_category(scope, official_by_category)
  customs = {}
  scope.each do |category|
    cfg = CATEGORIES[category]
    next unless cfg[:data_dir] && Dir.exist?(cfg[:data_dir])

    project_syms = index_by_db_symbol(cfg[:data_dir]).keys
    official = official_by_category && official_by_category[category]
    next unless official

    customs[category] = (project_syms - official.to_a).sort
  end
  customs
end

def print_customs_preview(customs, from_label, to_label)
  puts "\n--- Custom content preview ---"
  puts "These entries are in your project but were not found in #{from_label}."
  puts "They will be kept and appended to the #{to_label} pack:"

  any = false
  customs.each do |category, syms|
    next if syms.empty?

    any = true
    cap = 12
    shown = syms.first(cap)
    extra = syms.size - shown.size
    suffix = extra > 0 ? " (... and #{extra} more)" : ''
    puts "  #{category} (#{syms.size}): #{shown.join(', ')}#{suffix}"
  end
  puts '  (no custom content detected — switch will just install the new pack)' unless any
end

# Pulls (max_form_text_id_name, max_form_text_id_description) from a pack
# manifest's pokemon category entry. Falls back to scanning if unavailable.
def pack_form_text_id_maxes_from_manifest(pack_manifest)
  cat = pack_manifest&.dig('categories', 'pokemon')
  return nil unless cat

  [cat['max_form_text_id_name'].to_i, cat['max_form_text_id_description'].to_i]
end

# Returns [max_form_text_name, max_form_text_description] across all forms in
# every pokemon JSON in the index. 0 if none.
def pack_form_text_id_maxes(pokemon_index)
  name_max = 0
  desc_max = 0
  pokemon_index.each_value do |entry|
    (entry[:data]['forms'] || []).each do |form|
      ftid = form['formTextId'] || {}
      n = ftid['name'].to_i
      d = ftid['description'].to_i
      name_max = n if n > name_max
      desc_max = d if d > desc_max
    end
  end
  [name_max, desc_max]
end

# Pokemon-only: take pack file as the base, then append any forms in the project
# file that aren't present in the pack file (matched by the `form` integer key).
# Returns the merged data hash and the list of preserved form numbers.
def merge_pokemon_forms(pack_data, project_data)
  merged = pack_data.dup
  pack_forms = pack_data['forms'] || []
  project_forms = project_data['forms'] || []
  pack_form_ids = pack_forms.map { |f| f['form'] }
  custom_forms = project_forms.reject { |f| pack_form_ids.include?(f['form']) }
  merged['forms'] = pack_forms + custom_forms
  [merged, custom_forms.map { |f| f['form'] }]
end

# Wipes `data_dir`, then rewrites it from the union of pack entries (taking
# precedence) and project-only entries (renumbered to follow the pack list).
# Returns counts plus:
#   :csv_renumber   — id-CSV row moves     { old_row => new_row }
#   :form_renumber  — { 'name' => {old=>new}, 'description' => {old=>new} }
#     used by pokemon to remap rows in 100067 / 100068 for custom forms that
#     pointed into the new pack's overlay range.
#
# `prior_pack_symbols` (optional) lets us identify "custom" reliably as
# "in project but NOT shipped by the previously installed pack" rather than
# by diffing against the new pack.
def merge_data_folder(pack_dir, data_dir, category, official_symbols = nil, pack_manifest = nil)
  pack_index = index_by_db_symbol(pack_dir)
  project_index = index_by_db_symbol(data_dir)

  text_cfg = TEXT_CONFIG[category]
  id_field = text_cfg ? text_cfg[:id_field] : 'id'
  csv_offset = text_cfg ? text_cfg[:csv_row_offset] : 1

  max_pack_id = pack_index.values.map { |e| e[:data]['id'].to_i }.max || 0
  max_pack_text_id = pack_index.values.map { |e| e[:data][id_field].to_i }.max || 0

  # For pokemon: prefer pack-manifest values (canonical) over a live scan.
  # Also fold in CSV row counts so next_form_name lands BEYOND pack overlay
  # range, never inside it.
  if category == :pokemon
    pack_form_name_max, pack_form_desc_max = pack_form_text_id_maxes_from_manifest(pack_manifest)
    pack_form_name_max, pack_form_desc_max = pack_form_text_id_maxes(pack_index) if pack_form_name_max.nil?
    csv_rows = (pack_manifest && pack_manifest['csv_rows']) || {}
    # First safe destination index (beyond pack CSV overlay range).
    name_csv_floor = csv_rows['100067'].to_i - FORM_CSV_ROW_OFFSET
    desc_csv_floor = csv_rows['100068'].to_i - FORM_CSV_ROW_OFFSET
    # Widen bump threshold so we catch values inside CSV overlay range even
    # when pack JSONs don't reference them.
    pack_form_name_max = [pack_form_name_max, name_csv_floor - 1].max
    pack_form_desc_max = [pack_form_desc_max, desc_csv_floor - 1].max
    next_form_name = [pack_form_name_max + 1, name_csv_floor].max
    next_form_desc = [pack_form_desc_max + 1, desc_csv_floor].max
  end
  form_renumber = { 'name' => {}, 'description' => {} }

  FileUtils.rm_f(Dir.glob(File.join(data_dir, '*.json')))
  FileUtils.mkdir_p(data_dir)

  pack_written = 0
  merged_forms = 0

  # Decide who counts as "custom" — prefer the explicit official-symbols set
  # (the FROM pack's manifest in switch mode). Falls back to "not in the new
  # pack" if no manifest was provided.
  source_symbol_set = official_symbols ? official_symbols : pack_index.keys.to_set
  custom_syms = (project_index.keys - source_symbol_set.to_a).sort_by { |s| project_index[s][:data]['id'].to_i }

  # Pack entries (with form merge for Pokémon).
  pack_index.each do |sym, pack_entry|
    out = pack_entry[:data]
    if category == :pokemon && project_index.key?(sym)
      out, kept_forms = merge_pokemon_forms(pack_entry[:data], project_index[sym][:data])
      if kept_forms.any?
        # Custom forms inside a shared pokemon might also clash with pack form CSV rows.
        renumber_form_text_ids!(out, kept_forms, pack_form_name_max, pack_form_desc_max,
                                next_form_name, next_form_desc, form_renumber)
        next_form_name = (form_renumber['name'].values.max || pack_form_name_max) + 1
        next_form_desc = (form_renumber['description'].values.max || pack_form_desc_max) + 1
        puts "    merged forms in #{sym} (kept project forms: #{kept_forms.join(', ')})"
        merged_forms += 1
      end
    end
    File.write(File.join(data_dir, "#{sym}.json"), JSON.pretty_generate(out))
    pack_written += 1
  end

  # Custom (project-only) entries — renumber id (always) and textId (if present).
  next_id = max_pack_id + 1
  next_text_id = max_pack_text_id + 1
  csv_renumber = {}
  custom_dex_entries = []

  custom_syms.each do |sym|
    data = project_index[sym][:data]
    old_id = data['id'].to_i
    data['id'] = next_id

    if id_field != 'id' && data.key?(id_field)
      old_text_id = data[id_field].to_i
      data[id_field] = next_text_id
      csv_renumber[old_text_id + csv_offset] = next_text_id + csv_offset
      puts "    kept custom #{sym} (id #{old_id} → #{next_id}, #{id_field} #{old_text_id} → #{next_text_id})"
      next_text_id += 1
    else
      csv_renumber[old_id + csv_offset] = next_id + csv_offset
      puts "    kept custom #{sym} (id #{old_id} → #{next_id})"
    end

    if category == :pokemon
      form_numbers = (data['forms'] || []).map { |f| f['form'] }
      renumber_form_text_ids!(data, form_numbers, pack_form_name_max, pack_form_desc_max,
                              next_form_name, next_form_desc, form_renumber)
      next_form_name = (form_renumber['name'].values.max || pack_form_name_max) + 1
      next_form_desc = (form_renumber['description'].values.max || pack_form_desc_max) + 1

      # Default form for the national dex entry: form 0 if present, else
      # whatever the lowest form number is.
      forms = data['forms'] || []
      default_form = (forms.map { |f| f['form'] }.min || 0)
      custom_dex_entries << { 'dbSymbol' => sym, 'form' => default_form }
    end

    File.write(File.join(data_dir, "#{sym}.json"), JSON.pretty_generate(data))
    next_id += 1
  end

  {
    pack: pack_written,
    custom: custom_syms.size,
    form_merged: merged_forms,
    max_pack_id: max_pack_id,
    csv_renumber: csv_renumber,
    form_renumber: form_renumber,
    custom_dex_entries: custom_dex_entries
  }
end

# Appends custom pokemon to Data/Studio/dex/national.json after the pack
# files have been copied. Custom pokemon get appended in their renumbered-id
# order so their dex number matches their pokemon id.
def append_custom_pokemon_to_national_dex(custom_dex_entries)
  return if custom_dex_entries.empty?

  path = File.join('Data', 'Studio', 'dex', 'national.json')
  unless File.exist?(path)
    warn "  WARN: #{path} not found; skipping national dex update."
    return
  end

  dex = JSON.parse(File.read(path))
  dex['creatures'] ||= []

  added = 0
  custom_dex_entries.each do |entry|
    next if dex['creatures'].any? { |c| c['dbSymbol'] == entry['dbSymbol'] && c['form'] == entry['form'] }

    dex['creatures'] << entry
    added += 1
  end

  File.write(path, JSON.pretty_generate(dex))
  start_id = dex['startId'] || 1
  first_dex = start_id + dex['creatures'].size - added
  last_dex  = start_id + dex['creatures'].size - 1
  puts "  national dex: appended #{added} custom Pokémon (dex #{first_dex}..#{last_dex})"
end

# Walks `pokemon['forms']` for the given form numbers and bumps any
# `formTextId.name` / `.description` that's <= the pack's max to a fresh
# value beyond it. Records the moves in `form_renumber` so the 100067 /
# 100068 CSVs get the rows shifted to match.
#
# PSDK convention for form CSVs: `text N` lives at CSV row N+1 (the +1
# accounts for the header). The form_renumber map stores CSV row indices,
# not raw formTextId values, so it can be applied directly by merge_one_csv.
FORM_CSV_ROW_OFFSET = 1

def renumber_form_text_ids!(pokemon_data, form_numbers, pack_name_max, pack_desc_max,
                            next_name, next_desc, form_renumber)
  return unless pokemon_data['forms']

  set = form_numbers.to_set
  pokemon_data['forms'].each do |form|
    next unless set.include?(form['form'])

    ftid = form['formTextId']
    next unless ftid.is_a?(Hash)

    if ftid['name'].is_a?(Integer) && ftid['name'] <= pack_name_max && ftid['name'].positive?
      old = ftid['name']
      ftid['name'] = next_name
      form_renumber['name'][old + FORM_CSV_ROW_OFFSET] = next_name + FORM_CSV_ROW_OFFSET
      puts "      formTextId.name #{old} → #{next_name} (form #{form['form']}; CSV row #{old + FORM_CSV_ROW_OFFSET} → #{next_name + FORM_CSV_ROW_OFFSET})"
      next_name += 1
    end
    next unless ftid['description'].is_a?(Integer) && ftid['description'] <= pack_desc_max && ftid['description'].positive?

    old = ftid['description']
    ftid['description'] = next_desc
    form_renumber['description'][old + FORM_CSV_ROW_OFFSET] = next_desc + FORM_CSV_ROW_OFFSET
    puts "      formTextId.description #{old} → #{next_desc} (form #{form['form']}; CSV row #{old + FORM_CSV_ROW_OFFSET} → #{next_desc + FORM_CSV_ROW_OFFSET})"
    next_desc += 1
  end
end

# Merges one Dialogs CSV: pack rows overlay the project's, project rows beyond
# the pack's row count are preserved, and if `renumber` is non-empty each
# old_id row's content gets moved to the new_id position before pack overlay.
# `pack_row_count` is the row count of the pack's CSV (the "owned by pack" range).
def merge_one_csv(pack_csv, project_csv, renumber)
  return unless File.exist?(pack_csv)

  pack_rows = CSV.read(pack_csv)
  project_rows = File.exist?(project_csv) ? CSV.read(project_csv) : []

  # Determine width from pack header so we can pad blank rows consistently.
  width = pack_rows.first ? pack_rows.first.length : (project_rows.first ? project_rows.first.length : 1)

  blank_row = Array.new(width, nil)

  # 1. Apply renumbering: move project rows from old_id → new_id BEFORE pack overlay.
  unless renumber.empty?
    moves = renumber.map do |old_id, new_id|
      next nil if old_id >= project_rows.length

      [old_id, new_id, project_rows[old_id]]
    end.compact

    moves.each do |old_id, new_id, row|
      project_rows[new_id] = row || blank_row
      # Don't clear old_id — pack overlay below will replace it if old_id < pack range,
      # and if old_id is beyond pack range we leave the duplicate (rare for high ids).
    end
  end

  # 2. Extend project to at least pack length, then overlay pack rows.
  while project_rows.length < pack_rows.length
    project_rows << blank_row.dup
  end
  pack_rows.each_with_index { |row, i| project_rows[i] = row }

  # 3. Index-assignment beyond current length (step 1) fills intermediate
  # positions with nil. CSV's << can't serialise nil rows, so replace any
  # nils with a blank row of the correct width before writing.
  project_rows.map! { |row| row || blank_row.dup }

  FileUtils.mkdir_p(File.dirname(project_csv))
  CSV.open(project_csv, 'w') do |csv|
    project_rows.each { |row| csv << row }
  end
end

# For a category, row-merge all of its id-indexed and form-indexed CSVs. The
# `csv_renumber` map is { old_csv_row => new_csv_row } already shifted for the
# header offset. Form CSVs (100067/100068) are merged with no renumbering since
# their rows are referenced via formTextId, not entity id.
def merge_category_text(pack_root, category, csv_renumber, form_renumber = nil)
  id_csvs = (TEXT_CONFIG[category] || {})[:csvs] || []
  form_csvs = FORM_CSVS_BY_CATEGORY[category] || []

  id_csvs.each do |num|
    pack_csv = File.join(pack_root, TEXT_DIALOGS_DIR, "#{num}.csv")
    project_csv = File.join(TEXT_DIALOGS_DIR, "#{num}.csv")
    next unless File.exist?(pack_csv)

    merge_one_csv(pack_csv, project_csv, csv_renumber)
    moved = csv_renumber.empty? ? '' : " (moved #{csv_renumber.size} custom rows)"
    puts "    text #{num}.csv merged#{moved}"
  end

  # Form CSVs: 100067 is keyed by formTextId.name, 100068 by formTextId.description.
  form_renumber ||= { 'name' => {}, 'description' => {} }
  form_csv_map = { '100067' => form_renumber['name'] || {}, '100068' => form_renumber['description'] || {} }
  form_csvs.each do |num|
    pack_csv = File.join(pack_root, TEXT_DIALOGS_DIR, "#{num}.csv")
    project_csv = File.join(TEXT_DIALOGS_DIR, "#{num}.csv")
    next unless File.exist?(pack_csv)

    renum = form_csv_map[num] || {}
    merge_one_csv(pack_csv, project_csv, renum)
    moved = renum.empty? ? '' : " (moved #{renum.size} form rows)"
    puts "    text #{num}.csv merged (form-indexed)#{moved}"
  end
end

# Final pass for pack-shipped CSVs that aren't tied to any category we handle
# (natures, quest names/descs, pokédex region names, etc.). These get a plain
# row-level merge: pack rows overlay, project rows beyond are kept.
def merge_uncategorized_text(pack_root, used_csvs)
  pack_dialogs = File.join(pack_root, TEXT_DIALOGS_DIR)
  return unless Dir.exist?(pack_dialogs)

  Dir.children(pack_dialogs).each do |fname|
    next unless fname =~ /\A(\d+)\.csv\z/i

    num = Regexp.last_match(1)
    next if used_csvs.include?(num)

    merge_one_csv(File.join(pack_dialogs, fname), File.join(TEXT_DIALOGS_DIR, fname), {})
    puts "  text #{fname} merged (global)"
  end
end

def merge_pack(pack_root, scope, pack_manifest, official_symbols_by_category)
  used_csvs = Set.new

  scope.each do |category|
    config = CATEGORIES[category]
    puts "\n[#{category}] merging ..."

    csv_renumber = {}
    form_renumber = nil
    custom_dex_entries = []
    if config[:data_dir]
      pack_data_dir = File.join(pack_root, config[:data_dir])
      if Dir.exist?(pack_data_dir)
        FileUtils.mkdir_p(config[:data_dir])
        official = official_symbols_by_category && official_symbols_by_category[category]
        if official
          puts "  using FROM pack manifest (#{official.size} official #{category} symbols)"
        end
        stats = merge_data_folder(pack_data_dir, config[:data_dir], category, official, pack_manifest)
        csv_renumber = stats[:csv_renumber] || {}
        form_renumber = stats[:form_renumber]
        custom_dex_entries = stats[:custom_dex_entries] || []
        puts "  #{config[:data_dir]}: #{stats[:pack]} pack entries, #{stats[:custom]} custom kept, #{stats[:form_merged]} form-merged"
      end
    end

    (config[:mirror] + config[:copy_only]).each do |rel|
      next if rel == config[:data_dir]

      copy_tree(File.join(pack_root, rel), rel, rel)
    end

    # After pack's national.json has been copied in (above), append any
    # custom pokemon so they show up in the national pokédex.
    append_custom_pokemon_to_national_dex(custom_dex_entries) if category == :pokemon

    merge_category_text(pack_root, category, csv_renumber, form_renumber)
    ((TEXT_CONFIG[category] || {})[:csvs] || []).each { |n| used_csvs << n }
    (FORM_CSVS_BY_CATEGORY[category] || []).each { |n| used_csvs << n }
  end

  # Remaining pack CSVs not tied to a scoped category (natures, quests, regional
  # pokédex names, etc.): plain row-level merge so project rows beyond pack are kept.
  merge_uncategorized_text(pack_root, used_csvs)

  # Copy any non-Dialogs Text files (e.g. Studio/*.csv) overwrite-only.
  studio_text = File.join(pack_root, 'Data/Text/Studio')
  copy_tree(studio_text, 'Data/Text/Studio', 'Data/Text/Studio') if Dir.exist?(studio_text)
end

def copy_pack(pack_root, scope)
  mirror_dirs = scope.flat_map { |k| CATEGORIES[k][:mirror] }.uniq
  copy_dirs   = scope.flat_map { |k| CATEGORIES[k][:copy_only] }.uniq

  # Phase 1: mirror — delete orphans in pack-owned folders so e.g. later-gen
  # Pokémon don't linger as broken "egg" entries.
  mirror_dirs.each do |rel|
    pack_dir = File.join(pack_root, rel)
    next unless Dir.exist?(pack_dir)

    removed = delete_orphans(pack_dir, rel)
    puts "  mirrored #{rel}/ (removed #{removed} orphan files)" if removed > 0
  end

  # Phase 2: copy pack files into the selected folders.
  (mirror_dirs + copy_dirs).each do |rel|
    copy_tree(File.join(pack_root, rel), rel, rel)
  end

  # Always copy the names / descriptions CSVs — overwrite-only.
  copy_tree(File.join(pack_root, TEXT_DIR), TEXT_DIR, TEXT_DIR)
end

def main
  opts = parse_options
  chdir_to_project_root!
  strategy = choose_strategy(opts)
  choose_source(opts)
  if strategy == :switch
    choose_switch_gens(opts)
  else
    choose_gen_version(opts)
  end
  scope = choose_scope(opts)

  # Resolve the TO pack (and FROM pack for switch).
  pack_root = resolve_pack_root(opts)
  abort "ERROR: pack folder not found: #{pack_root}" unless Dir.exist?(pack_root)

  from_pack_root = nil
  from_manifest = nil
  from_official_symbols = nil
  if strategy == :switch
    from_pack_root = resolve_from_pack_root(opts)
    abort "ERROR: FROM pack folder not found: #{from_pack_root}" unless Dir.exist?(from_pack_root)

    from_manifest = load_pack_manifest(from_pack_root)
    from_official_symbols = manifest_pack_symbols(from_manifest)
    abort 'ERROR: FROM pack has no manifest.json — re-run the GameDataPacks generator first.' unless from_official_symbols

    customs = project_customs_by_category(scope, from_official_symbols)
    print_customs_preview(customs, opts[:from_version], opts[:version])
  end

  backup_dest = backup_folder
  puts "\nAbout to apply: Gen #{opts[:gen]} / #{opts[:version]}"
  puts "  From:       Gen #{opts[:from_gen]} / #{opts[:from_version]}" if strategy == :switch
  puts "  Categories: #{scope.join(', ')}"
  puts "  Strategy:   #{strategy}"
  puts "  Target project: #{Dir.pwd}"
  puts "  Backup will be written to: #{backup_dest}"
  case strategy
  when :overwrite
    puts '  WARNING: selected pack-owned folders will be mirrored (project files not in the pack are deleted).'
    puts '  Custom data in those folders may be lost — restore from the backup if needed.'
  when :switch
    puts "  Switch mode: #{opts[:from_version]} defines what is \"official\" content to preserve"
    puts "  custom content and brought over to the #{opts[:version]}."
  end

  if opts[:dry_run]
    puts "\n[dry-run] Nothing was changed. Re-run without --dry-run to apply."
    return
  end

  unless opts[:yes]
    puts "\nProceed? [yes/no]"
    answer = prompt('Choice') || ''
    abort 'Aborted.' unless answer.downcase.start_with?('y')
  end

  puts "\nBacking up current project folders ..."
  backup_project(backup_dest)
  prune_old_backups

  pack_manifest = load_pack_manifest(pack_root)
  official_for_strategy = strategy == :switch ? from_official_symbols : nil

  if strategy == :switch
    puts(pack_manifest ? "Loaded pack manifest: Gen #{pack_manifest['gen']} / #{pack_manifest['version']}" : 'No pack manifest found; will scan pack JSONs directly.')
    if official_for_strategy
      counts = official_for_strategy.map { |c, s| "#{c}=#{s.size}" }.join(', ')
      puts "Loaded official symbols from #{opts[:from_version]} pack (#{counts})."
    end
  end

  puts "Applying pack from #{pack_root} (#{strategy}) ..."
  case strategy
  when :overwrite then copy_pack(pack_root, scope)
  when :switch then merge_pack(pack_root, scope, pack_manifest, official_for_strategy)
  end

  puts "\nDone. Gen #{opts[:gen]} / #{opts[:version]} applied (#{scope.join(', ')}, #{strategy})."
  puts "Backup: #{backup_dest}"
end

main
