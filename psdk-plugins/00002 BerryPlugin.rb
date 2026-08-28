# Berry tree quality-of-life helpers.
#
# PSDK ships Yuki::Berries (4 Systems/003 Map Engine/2 Logic/03 Berries) but
# nothing in the engine ever calls it — every berry tree has to be wired by hand
# with the map id, the event id and raw module calls. This plugin adds
# interpreter shortcuts so a berry tree event is a one-liner, and fixes two
# rough edges in the stock module:
#
#   * init_berry OVERWRITES the saved tree, so calling it on every map load
#     resets growth. `berry_tree` only initialises once.
#   * init_berry never seeds the stage timer (data[2]), so a tree created below
#     stage 4 advances almost immediately. `berry_tree` seeds it like `plant`.
#
# Berry data layout (PFM.game_state.berries[map_id][event_id]):
#   [berry_id, stage, timer, stage_time, water_timer, water_time, water_count, fertilizer]

module Yuki
  module Berries
    module_function

    # Tell if a berry tree was already set up on this event
    # @param map_id [Integer] id of the map
    # @param event_id [Integer] id of the event
    # @return [Boolean]
    def initialized?(map_id, event_id)
      find_berry_data(map_id).key?(event_id)
    end
  end
end

class Interpreter
  # Set up a berry tree on THIS event. Safe to call from an autorun/parallel
  # page — it does nothing if the tree already exists, so growth is preserved
  # across map loads and saves.
  # @param berry_id [Symbol, Integer] db_symbol or id of the berry item
  # @param stage [Integer] growth stage, 0 = just planted … 4 = ripe
  # @return [Boolean] true when the tree was created by this call
  def berry_tree(berry_id, stage = 4)
    map_id = $game_map.map_id
    return false if Yuki::Berries.initialized?(map_id, @event_id)
    return false unless data_item(berry_id).is_berry

    Yuki::Berries.init_berry(map_id, @event_id, berry_id, stage)
    data = Yuki::Berries.find_berry_data(map_id)[@event_id]
    # Stock init_berry leaves the countdown at 0; seed it so an unripe tree
    # takes a full stage to advance (this is what `plant` does).
    data[2] = data[3] if stage < 4
    Yuki::Berries.update_event(@event_id, data)
    return true
  end

  # Tell if a berry is currently planted on the event
  # @param event_id [Integer] defaults to this event
  # @return [Boolean]
  def berry_here?(event_id = @event_id)
    return Yuki::Berries.here?(event_id)
  end

  # Growth stage of the berry on the event (0 = planted, 4 = ripe)
  # @param event_id [Integer] defaults to this event
  # @return [Integer]
  def berry_stage(event_id = @event_id)
    return Yuki::Berries.get_stage(event_id)
  end

  # Tell if the berry is fully grown and ready to harvest
  # @param event_id [Integer] defaults to this event
  # @return [Boolean]
  def berry_ripe?(event_id = @event_id)
    return berry_here?(event_id) && berry_stage(event_id) >= 4
  end

  # Tell if the berry has been watered recently
  # @param event_id [Integer] defaults to this event
  # @return [Boolean]
  def berry_watered?(event_id = @event_id)
    return Yuki::Berries.watered?(event_id)
  end

  # Harvest the berry, adding the yield to the bag. Only a fully grown tree
  # yields — stock Yuki::Berries.take does not gate on ripeness itself, so we do.
  # @param event_id [Integer] defaults to this event
  # @return [Integer, nil] number of berries obtained (nil if none / not ripe)
  def berry_take(event_id = @event_id)
    return nil unless berry_ripe?(event_id)

    return Yuki::Berries.take(event_id)
  end

  # Plant a berry on the event (soil must be empty)
  # @param berry_id [Symbol, Integer] db_symbol or id of the berry item
  # @param event_id [Integer] defaults to this event
  # @return [Boolean]
  def berry_plant(berry_id, event_id = @event_id)
    return false unless data_item(berry_id).is_berry

    Yuki::Berries.plant(event_id, data_item(berry_id).id)
    return true
  end

  # Plant a berry chosen from the bag on THIS event's empty soil. Opens the bag
  # filtered to the Berries pocket (PSDK's `:berry` mode); a no-op if the player
  # backs out or the soil is already occupied.
  # @return [Boolean] true when a berry was planted
  def berry_plant_from_bag
    return false if berry_here?

    chosen = :__undef__
    GamePlay.open_bag_to_plant_berry { |bag| chosen = bag.selected_item_db_symbol }
    return false if chosen == :__undef__ || !data_item(chosen).is_berry

    Yuki::Berries.plant(@event_id, data_item(chosen).id)
    return true
  end

  # Water the berry, improving its future yield. No-op on empty soil or a fully
  # grown tree, and capped at the 0..4 the yield formula expects (stock
  # Yuki::Berries.water enforces neither guard).
  # @param event_id [Integer] defaults to this event
  # @return [void]
  def berry_water(event_id = @event_id)
    return unless berry_here?(event_id)
    return if berry_stage(event_id) >= 4

    data = Yuki::Berries.data && Yuki::Berries.data[event_id]
    return if data && data[6] >= 4

    Yuki::Berries.water(event_id)
  end
end

# --- Custom berry tree event graphic -----------------------------------------
#
# Studio's berry editor can set an optional event charset (a `graphicName`) on a
# berry's data. PSDK otherwise hard-derives the tree sprite from the item id
# ("Z_B#{id}"), so two small patches teach it to honour the custom charset:
#
#   1. Studio::Item::BerryData keeps the `graphicName` key Studio writes — the
#      stock loader allowlists a fixed field set and drops unknown keys — and
#      exposes it as `graphic_name`.
#   2. Yuki::Berries.update_event uses that charset for the grown stages (1..4),
#      falling back to the automatic "Z_B#{id}" when it's blank. Stage 0 (freshly
#      planted soil) still uses the shared PLANTED_CHAR.
#
# The custom charset must follow the same layout as PSDK's Z_B<id> trees: the four
# growth stages are the four rows of the charset, chosen by the event direction
# update_event already sets — this patch only swaps the charset name.
#
# NOTE: graphic_name is captured during Studio->PSDK conversion, so a berry's new
# graphic is picked up the next time Data/Studio/psdk.dat is regenerated (delete
# it, or run project compilation, on a non-release boot).

module Studio
  class Item
    class BerryData
      # Patch module capturing the Studio-only `graphicName` field that the stock
      # {Studio::Item::BerryData.try_create} allowlist discards.
      module GraphicNameCapture
        # Override of {Studio::Item::BerryData.try_create} to also stash graphicName
        # @param hash [Hash] the berry-data sub-hash from the Studio JSON
        # @return [Studio::Item::BerryData, nil]
        def try_create(hash)
          obj = super
          # try_create returns nil when a required key is missing/mistyped.
          obj&.instance_variable_set(:@graphic_name, hash['graphicName'])
          return obj
        end
      end
      singleton_class.prepend(GraphicNameCapture)

      # Custom berry-tree event charset set in Studio, or nil to use the default.
      # @return [String, nil]
      attr_reader :graphic_name
    end
  end
end

module Yuki
  module Berries
    # Patch module honouring a berry item's custom event charset for the grown
    # tree stages, falling back to PSDK's automatic "Z_B#{id}" convention.
    module CustomTreeGraphic
      # Override of {Yuki::Berries.update_event} applying the custom charset.
      # Prepended on the singleton so it also covers the internal `init` /
      # `plant` / `update` calls (all invoke update_event with self = the module).
      # @param event_id [Integer] id of the event the berry tree is shown on
      # @param data [Array] berry data (see {Yuki::Berries})
      # @return [void]
      def update_event(event_id, data)
        super
        return if data[0] == 0 # empty soil — super already hid the event
        return if data[1] == 0 # stage 0 keeps the shared PLANTED_CHAR

        graphic = data_item(data[0]).berry_data&.graphic_name
        return if graphic.nil? || graphic.empty?
        return unless (event = $game_map.events[event_id])

        event.character_name = graphic # keeps the stage direction super set
      end
    end
    class << self
      prepend CustomTreeGraphic
    end
  end
end
