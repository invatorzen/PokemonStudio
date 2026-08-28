class Spriteset_Map
  # Plugin adding the fog effect to the Spriteset_Map
  module FogPlugin
    private
    # Update some fog sprite parameters
    def update_fog_sprite_parameters
      @fog.zoom = ($game_map.fog_zoom / 100.0) * 0.5
      @fog.opacity = $game_map.fog_opacity.to_i
      @fog.blend_type = $game_map.fog_blend_type
      
      # Use display_x/4 to fix parallax to the map, but add offset_x/oy for manual positioning.
      # Game_Map#fog_ox and fog_oy are RMXP logic counters for active scrolling (fog_sx/sy).
      @fog.set_origin($game_map.display_x / 4 + $game_map.fog_ox + $game_map.fog_offset_x, 
                      $game_map.display_y / 4 + $game_map.fog_oy + $game_map.fog_offset_y)
                      
      @fog.tone = $game_map.fog_tone
    end
  end
end

class Plane
  alias multiply_fog_original_blend_type_set blend_type=

  # Set the blend type
  # @param blend_type [Integer] 0 = normal, 1 = addition, 2 = subtraction, 3 = multiply
  def blend_type=(blend_type)
    if blend_type == 3 # multiply
      shader.blend_type = 0
      
      # Result = Source * Destination + Destination * 0
      shader.color_src_factor = LiteRGSS::BlendMode::DstColor
      shader.color_dest_factor = LiteRGSS::BlendMode::Zero
      shader.alpha_src_factor = LiteRGSS::BlendMode::DstAlpha
      shader.alpha_dest_factor = LiteRGSS::BlendMode::Zero
      
      shader.color_equation = LiteRGSS::BlendMode::Add
      shader.alpha_equation = LiteRGSS::BlendMode::Add
      
      @blend_type = blend_type
    else
      multiply_fog_original_blend_type_set(blend_type)
    end
  end
end

class Game_System
  attr_accessor :map_fog_overrides

  def init_map_fog_overrides
    @map_fog_overrides ||= {}
  end
end

class Game_Map
  attr_accessor :fog_offset_x, :fog_offset_y

  alias multiply_fog_original_setup setup
  def setup(map_id)
    multiply_fog_original_setup(map_id)
    
    # Initialize default offsets
    @fog_offset_x = 0
    @fog_offset_y = 0
    
    if $game_system.respond_to?(:map_fog_overrides) && $game_system.map_fog_overrides
      override = $game_system.map_fog_overrides[map_id]
      if override
        @fog_name = override[:name]
        @fog_hue = override[:hue]
        @fog_opacity = override[:opacity]
        @fog_blend_type = override[:blend_type]
        @fog_zoom = override[:zoom]
        @fog_sx = override[:sx]
        @fog_sy = override[:sy]
        @fog_offset_x = override[:ox] || 0
        @fog_offset_y = override[:oy] || 0
      end
    end
  end
end

class Interpreter
  # Fog offset support for the Change Fog (204) event command. Studio's fork
  # writes the static offset as extra parameters [8]/[9] on the 204 command;
  # vanilla command_204 only reads [1..7], so consume the extras here and
  # forward them to $game_map.fog_offset_x/y (used by the render patch above).
  module FogOffset204
    # Apply the fog offset extras after the normal Change Fog handling
    # @return [Boolean]
    def command_204
      result = super
      if @parameters[0] == 1
        $game_map.fog_offset_x = @parameters[8] || 0
        $game_map.fog_offset_y = @parameters[9] || 0
      end
      result
    end
  end
  prepend FogOffset204
end

class Interpreter
  # Sets a persistent fog override for a specific map.
  # @param map_id [Integer] the ID of the map
  # @param graphic [String] the fog graphic filename
  # @param blend_mode [Symbol, Integer] the blend mode (e.g. :normal, :addition, :subtraction, :multiply)
  # @param opacity [Integer] fog opacity (0-255)
  # @param zoom [Integer] fog zoom (100 = 100%)
  # @param sx [Integer] scroll speed x
  # @param sy [Integer] scroll speed y
  # @param hue [Integer] color hue (0-360)
  # @param ox [Integer] initial static X offset
  # @param oy [Integer] initial static Y offset
  def set_map_fog(map_id, graphic, blend_mode = :normal, opacity: 255, zoom: 100, sx: 0, sy: 0, hue: 0, ox: 0, oy: 0)
    $game_system.init_map_fog_overrides
    
    blend_type = 0
    case blend_mode
    when :add, :addition then blend_type = 1
    when :sub, :subtraction then blend_type = 2
    when :mult, :multiply then blend_type = 3
    when Integer then blend_type = blend_mode
    end
    
    $game_system.map_fog_overrides[map_id] = {
      name: graphic,
      hue: hue,
      opacity: opacity,
      blend_type: blend_type,
      zoom: zoom,
      sx: sx,
      sy: sy,
      ox: ox,
      oy: oy
    }

    if $game_map && $game_map.map_id == map_id
      $game_map.fog_name = graphic
      $game_map.fog_hue = hue
      $game_map.fog_opacity = opacity
      $game_map.fog_blend_type = blend_type
      $game_map.fog_zoom = zoom
      $game_map.fog_sx = sx
      $game_map.fog_sy = sy
      $game_map.fog_offset_x = ox
      $game_map.fog_offset_y = oy
    end
  end

  # Clears the fog override for a specific map.
  # @param map_id [Integer] the ID of the map
  def clear_map_fog(map_id)
    $game_system.init_map_fog_overrides
    $game_system.map_fog_overrides.delete(map_id)
    
    if $game_map && $game_map.map_id == map_id
      map_data = $game_map.instance_variable_get(:@map)
      tileset = $data_tilesets[map_data.tileset_id] if map_data
      if tileset
        $game_map.fog_name = tileset.fog_name
        $game_map.fog_hue = tileset.fog_hue
        $game_map.fog_opacity = tileset.fog_opacity
        $game_map.fog_blend_type = tileset.fog_blend_type
        $game_map.fog_zoom = tileset.fog_zoom
        $game_map.fog_sx = tileset.fog_sx
        $game_map.fog_sy = tileset.fog_sy
        $game_map.fog_offset_x = 0
        $game_map.fog_offset_y = 0
      end
    end
  end
end