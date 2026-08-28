# Time-based interpolation of map overlay settings, used by {Interpreter#update_overlay}
# @note Interpolates numeric settings (opacity, distance_factor, zoom) and Color
#   settings (sample_color). Anything else — textures, blend mode, map_affix,
#   position, direction1 — has no meaningful in-between value and is applied at
#   once by {Interpreter#update_overlay} instead of going through a transition.
class MapOverlayTransition
  # Create a new transition and start it
  # @param preset [PFM::MapOverlay::PresetBase] the overlay preset to retune
  # @param targets [Hash{Symbol => Numeric, Color}] setting name => value to reach
  # @param duration [Float] number of seconds the transition takes
  def initialize(preset, targets, duration)
    @preset = preset
    @targets = targets
    @origins = {}
    targets.each_key { |name| @origins[name] = preset.send(name) }
    @animation = Yuki::Animation.scalar(duration, self, :progress=, 0.0, 1.0)
    @animation.start
  end

  # Advance the transition by one frame
  # @return [Boolean] true while the transition is still running
  def update
    @animation.update
    return !@animation.done?
  end

  # Apply every setting at the given point of the transition
  # @param factor [Float] 0.0 upto 1.0
  # @return [void]
  def progress=(factor)
    @targets.each do |name, target|
      @preset.send(:"#{name}=", interpolate(@origins[name], target, factor))
    end
  end

  private

  # Interpolate a single setting
  # @param from [Numeric, Color] value the setting had when the transition started
  # @param to [Numeric, Color] value the setting should reach
  # @param factor [Float] 0.0 upto 1.0
  # @return [Numeric, Color]
  def interpolate(from, to, factor)
    return lerp(from, to, factor) if from.is_a?(Numeric) && to.is_a?(Numeric)

    if from.is_a?(Color) && to.is_a?(Color)
      return Color.new(
        lerp(from.red, to.red, factor).round,
        lerp(from.green, to.green, factor).round,
        lerp(from.blue, to.blue, factor).round,
        lerp(from.alpha, to.alpha, factor).round
      )
    end

    return to
  end

  # Linear interpolation between two numbers
  # @param a [Numeric]
  # @param b [Numeric]
  # @param factor [Float] 0.0 upto 1.0
  # @return [Float]
  def lerp(a, b, factor)
    return a + (b - a) * factor
  end
end

class Interpreter
  # Map overlay transitions currently running
  # @note Deliberately held on the class and NOT on PFM::MapOverlay: they are
  #   transient view state, and putting them in the saved game state would drag
  #   animation objects into the save file.
  # @return [Array<MapOverlayTransition>]
  @overlay_transitions = []

  class << self
    # Map overlay transitions currently running
    # @return [Array<MapOverlayTransition>]
    attr_reader :overlay_transitions

    # Advance every running transition and drop the ones that finished
    # @return [void]
    def update_overlay_transitions
      return if @overlay_transitions.empty?

      @overlay_transitions.select!(&:update)
    end

    # Drop every running transition
    # @return [void]
    def clear_overlay_transitions
      @overlay_transitions.clear
    end
  end

  # Adjust the settings of the map overlay that is currently running
  # @note Does nothing when no overlay is active, so the command is safe to call
  #   from an event that doesn't know whether {#start_overlay} ran.
  # @note Settings that the active preset doesn't support are skipped and logged
  #   rather than raising, because the running preset isn't known when the event
  #   is authored (a :fog overlay has no :direction1, for instance).
  # @param duration [Float] seconds the change takes; 0 applies it instantly
  # @param options [Hash] settings to apply on the active preset
  # @option options [Float] :opacity 0.0 upto 1.0
  # @option options [Symbol] :blend_mode one of PresetBase::ALLOWED_BLEND_MODES
  # @option options [Numeric] :distance_factor how fast the effect fades in from the screen centre
  # @option options [Color] :sample_color tint of the effect
  # @option options [Array<Numeric>] :direction1 scroll direction, scroll preset only
  # @option options [String] :extra_texture_name image preset texture, from graphics/fogs
  # @option options [String] :noise_texture_name noise texture, from graphics/fogs
  # @option options [String] :color_gradient_texture_name gradient texture, from graphics/fogs
  # @option options [Boolean] :map_affix whether the overlay stays fixed to the map
  # @option options [Numeric] :zoom overlay zoom, used when :map_affix is true
  # @option options [Array<Numeric>, Symbol] :position tile coordinates or :game_player
  # @return [Boolean] false if no overlay was running, true otherwise
  # @example Halve the opacity instantly
  #   update_overlay(opacity: 0.5)
  # @example Thicken a fog over two seconds
  #   update_overlay(distance_factor: 0.8, duration: 2.0)
  def update_overlay(duration: 0, **options)
    preset = current_overlay_preset
    return false unless preset

    targets = {}
    options.each do |name, value|
      setter = :"#{name}="
      unless preset.respond_to?(setter)
        log_error("Map overlay preset #{preset.class} has no setting ##{name}, skipped")
        next
      end

      if duration > 0 && overlay_interpolatable?(preset, name, value)
        targets[name] = value
      else
        preset.send(setter, value)
      end
    end

    Interpreter.overlay_transitions << MapOverlayTransition.new(preset, targets, duration.to_f) unless targets.empty?
    return true
  end

  private

  # Tell if a setting can be interpolated instead of being applied at once
  # @param preset [PFM::MapOverlay::PresetBase]
  # @param name [Symbol] name of the setting
  # @param value [Object] value the setting should reach
  # @return [Boolean]
  def overlay_interpolatable?(preset, name, value)
    return false unless preset.respond_to?(name)

    current = preset.send(name)
    return true if current.is_a?(Numeric) && value.is_a?(Numeric)
    return true if current.is_a?(Color) && value.is_a?(Color)

    return false
  end

  # Patch module dropping overlay transitions when the overlay itself changes
  module OverlayTransitionReset
    # Override of {Interpreter#start_overlay} to drop transitions aimed at the previous preset
    # @param preset [Symbol]
    # @return [void]
    def start_overlay(preset)
      Interpreter.clear_overlay_transitions
      super
    end

    # Override of {Interpreter#stop_overlay} to drop every running transition
    # @return [void]
    def stop_overlay
      Interpreter.clear_overlay_transitions
      super
    end
  end
  prepend OverlayTransitionReset
end

class Scene_Map
  # Patch module advancing the map overlay transitions started by {Interpreter#update_overlay}
  module MapOverlayTransitionUpdater
    # Override of {Scene_Map#update} to advance running overlay transitions
    # @return [Boolean]
    def update
      result = super
      Interpreter.update_overlay_transitions
      return result
    end
  end
  prepend MapOverlayTransitionUpdater
end
