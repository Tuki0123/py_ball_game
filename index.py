import pygame
import sys
from math import copysign, sin, cos, asin, pi, atan2, sqrt
pygame.init()  #Initialize all modules of pygame

#Window size setting
WIDTH, HEIGHT = 1530, 800
screen = pygame.display.set_mode((WIDTH, HEIGHT)) #Create a display window
pygame.display.set_caption("Elastic Collision - Interactive Demo") #Window title
clock = pygame.time.Clock() #Control frame rate

TRACK_WIDTH = 1070
g = 0.15  #Gravitational acceleration for arc orbital motion calculations

#Custom font loading function
def create_font(size, bold=False):
    fonts = ["Arial", "Helvetica", "sans-serif"]
    for name in fonts:
        try:
            return pygame.font.SysFont(name, size, bold) #Try loading the system font
        except:
            continue
    return pygame.font.Font(None, size) #Bottom-load the default font

#Initialize fonts of different sizes
font_small = create_font(22)
font_large = create_font(44, bold=True)
font_speed = create_font(32)

#Color definition
bg_color = (220, 240, 255)
ground_color = (180, 210, 255)
panel_color = (240, 248, 255)
text_color = (50, 70, 120)

GROUND_Y = 540 #Y-axis coordinates of the orbit

mode = "elastic" #Default collision mode: Elastic collision
phase2_enabled = True  #Arc-shaped tracks are enabled by default


#Phase2 (Arc-shaped Track) Ball Initialization Function
def init_ball_phase2(ball):
    ball["zone"] = "straight" #Movement area: Straight lane
    ball["vy"] = 0.0 #Vertical velocity (for arc-shaped tracks)
    ball["arc_alpha"] = 0.0 #Angle of motion on the curved track
    ball["arc_v0"] = 0.0 #Initial velocity into the arc orbit
    ball["stopped"] = False #Whether to stop motion

#Blue ball object
blue_ball = {
    "x": 165.0, #x-coordinate
    "y": GROUND_Y, #y-coordinate
    "radius": 50, #radius
    "color": (100, 180, 255), #color
    "vx": 8.0, #horizontal velocity
    "mass": 6.0 #mass
}
init_ball_phase2(blue_ball) #Initialize the state of the blue ball

#Pink ball object
pink_ball = {
    "x": 850.0, 
    "y": GROUND_Y,
    "radius": 35,
    "color": (255, 160, 200),
    "vx": -4.0,
    "mass": 4.0
}
init_ball_phase2(pink_ball)

#Reset the reference value for the speed of the small ball
reset_blue = {"vx": 8.0}
reset_pink = {"vx": -4.0}

#Global state variable
paused = False #Halted state
ball_collision_happened = False #Whether a collision occurred
balls_stopped = False #Whether the small ball stopped

momentum_before_collision = None #Pre-collision momentum
energy_before_collision = None #Pre-collision kinetic energy


#Slider control class (core interactive control)
class Slider:
    def __init__(self, x, y, width, min_val, max_val, start_val, label, knob_color=None):
        self.rect = pygame.Rect(x, y, width, 20) #Slider background rectangle
        self.min = min_val #Minimum value
        self.max = max_val #Maximum value
        self.value = start_val #Current value
        self.label = label #Lable
        self.knob_color = knob_color #Knob color
        self.dragging = False #Whether to drag

    def draw(self):
        #Draw the slider background
        pygame.draw.rect(screen, (200, 200, 200), self.rect.inflate(0, 12))
        pygame.draw.rect(screen, (150, 180, 220), self.rect.inflate(0, 12))
        #Calculate the X-coordinate of the knob (in proportion)
        pos_x = self.rect.x + (self.value - self.min) / (self.max - self.min) * self.rect.w
        fill = self.knob_color if self.knob_color is not None else (80, 150, 255)
        #Drawing knob
        pygame.draw.circle(screen, fill, (int(pos_x), self.rect.centery + 6), 14)
        pygame.draw.circle(screen, (255, 255, 255), (int(pos_x), self.rect.centery + 6), 14, 3)
        #Draw label text
        txt_color = self.knob_color if self.knob_color is not None else text_color
        text = font_small.render(f"{self.label}: {self.value:.1f}", True, txt_color)
        screen.blit(text, (self.rect.x, self.rect.y - 28))

    def update(self, event):
        #Mouse drag logic
        if event.type == pygame.MOUSEBUTTONDOWN:
            mx, my = event.pos
            knob_x = self.rect.x + (self.value - self.min) / (self.max - self.min) * self.rect.w
            #Expand the click detection area and improve interaction fault tolerance
            if self.rect.collidepoint(mx, my) or (abs(mx - knob_x) < 18 and abs(my - self.rect.centery) < 25):
                self.dragging = True
        if event.type == pygame.MOUSEBUTTONUP:
            self.dragging = False
        if event.type == pygame.MOUSEMOTION and self.dragging:
            #Limit the drag range and calculate the current value
            rel_x = max(0, min(event.pos[0] - self.rect.x, self.rect.w))
            self.value = self.min + (rel_x / self.rect.w) * (self.max - self.min)

#Initialize the slider list (ball mass radius velocity arc track radius)
sliders = [
    Slider(1100, 120, 180, 1, 20, 6.0, "Blue Ball Mass"),
    Slider(1300, 120, 180, 20, 80, 50, "Blue Ball Radius"),
    Slider(1100, 180, 180, 1, 20, 4.0, "Pink Ball Mass"),
    Slider(1300, 180, 180, 20, 80, 35, "Pink Ball Radius"),
    Slider(1100, 240, 180, 0, 10, 8.0, "Blue Ball Speed", blue_ball["color"]),
    Slider(1300, 240, 180, 0, 10, 4.0, "Pink Ball Speed", pink_ball["color"]),
    Slider(1100, 300, 180, 100, 200, 160, "Semicircle Radius"),
]

#Button rectangular area (Collision mode Phase2 switch)
btn_elastic_rect = pygame.Rect(1100, 350, 140, 36)
btn_inelastic_rect = pygame.Rect(1250, 350, 140, 36)
btn_phase2_rect = pygame.Rect(1100, 395, 290, 36)


def get_semicircle_R():
    return sliders[6].value if phase2_enabled else 0

def draw_background():
    screen.fill(bg_color)
    R = get_semicircle_R()
    if not phase2_enabled or R <= 0:
        pygame.draw.line(screen, ground_color, (0, GROUND_Y), (TRACK_WIDTH, GROUND_Y), 4)
    else:
        left_end = R
        right_start = TRACK_WIDTH - 2 * R
        pygame.draw.line(screen, ground_color, (left_end, GROUND_Y), (right_start + R, GROUND_Y), 4)
        rect_left = pygame.Rect(0, GROUND_Y - 2 * R, 2 * R, 2 * R)
        pygame.draw.arc(screen, ground_color, rect_left, pi / 2, -pi / 2, 4)
        rect_right = pygame.Rect(right_start, GROUND_Y - 2 * R, 2 * R, 2 * R)
        pygame.draw.arc(screen, ground_color, rect_right, -pi / 2, pi / 2, 4)


def get_ball_speed(ball):
    if ball["zone"] == "straight":
        return abs(ball["vx"])
    if ball["stopped"]:
        return 0.0
    v0 = ball.get("arc_v0", 0)
    R = get_semicircle_R()
    r = ball["radius"]
    R_eff = max(1, R - r)
    alpha = ball["arc_alpha"]
    v_sq = v0 * v0 - 2 * g * R_eff * (1 - sin(alpha))
    return sqrt(max(0, v_sq))

def get_ball_velocity_angle(ball):
    if ball["zone"] == "straight":
        return 0.0 if ball["vx"] >= 0 else pi
    if ball["stopped"]:
        return 0.0
    alpha = ball["arc_alpha"]
    if ball["zone"] == "left_arc":
        return atan2(cos(alpha), -sin(alpha))
    return atan2(-cos(alpha), sin(alpha))

def draw_ball(ball):
    x = int(ball["x"])
    y = int(ball["y"]) - int(ball["radius"]) #Adjust the y-coordinate so that the bottom of the ball fits the track
    r = int(ball["radius"])
    color = ball["color"]
    #Draw the ball (main body + highlights + border)
    pygame.draw.circle(screen, ball["color"], (x, y), r)
    pygame.draw.circle(screen, (255, 255, 255), (x + r // 3, y - r // 3), r // 4)
    pygame.draw.circle(screen, (255, 255, 255, 120), (x, y), r, 3)

    #Speed arrow drawing (visualizing the magnitude of the speed direction
    arrow_y = y - r - 30
    arrow_length = 40
    arrow_head_size = 8
    speed = get_ball_speed(ball)
    #Arc track: draw tangent direction arrows (trigonometric calculation angles)
    if phase2_enabled and ball["zone"] != "straight":
        angle = get_ball_velocity_angle(ball)
        cos_a, sin_a = cos(angle), sin(angle)
        arrow_start_x = x - arrow_length / 2 * cos_a
        arrow_start_y = arrow_y - arrow_length / 2 * sin_a
        arrow_end_x = x + arrow_length / 2 * cos_a
        arrow_end_y = arrow_y + arrow_length / 2 * sin_a
        pygame.draw.line(screen, color, (arrow_start_x, arrow_start_y), (arrow_end_x, arrow_end_y), 3)
        #Arrow head
        head_dx = arrow_head_size * cos_a
        head_dy = arrow_head_size * sin_a
        perp_x = arrow_head_size * sin_a
        perp_y = -arrow_head_size * cos_a
        arrow_points = [(arrow_end_x, arrow_end_y),
                        (arrow_end_x - head_dx + perp_x, arrow_end_y - head_dy + perp_y),
                        (arrow_end_x - head_dx - perp_x, arrow_end_y - head_dy - perp_y)]
        pygame.draw.polygon(screen, color, arrow_points)
    #Straight path: Draw a horizontal arrow
    else:
        if ball["vx"] > 0:
            arrow_start_x = x - arrow_length / 2
            arrow_end_x = x + arrow_length / 2
            pygame.draw.line(screen, color, (arrow_start_x, arrow_y), (arrow_end_x, arrow_y), 3)
            arrow_points = [(arrow_end_x, arrow_y),
                            (arrow_end_x - arrow_head_size, arrow_y - arrow_head_size),
                            (arrow_end_x - arrow_head_size, arrow_y + arrow_head_size)]
            pygame.draw.polygon(screen, color, arrow_points)
        elif ball["vx"] < 0:
            arrow_start_x = x + arrow_length / 2
            arrow_end_x = x - arrow_length / 2
            pygame.draw.line(screen, color, (arrow_start_x, arrow_y), (arrow_end_x, arrow_y), 3)
            arrow_points = [(arrow_end_x, arrow_y),
                            (arrow_end_x + arrow_head_size, arrow_y - arrow_head_size),
                            (arrow_end_x + arrow_head_size, arrow_y + arrow_head_size)]
            pygame.draw.polygon(screen, color, arrow_points)
    #Speed value display (below the arrow)
    if speed > 0:
        speed_text = font_speed.render(f"{speed:.1f}", True, color)
        screen.blit(speed_text, speed_text.get_rect(center=(x, arrow_y - 20)))


def move_ball(ball):
    if paused or balls_stopped:
        return
    R = get_semicircle_R() #Obtain the radius of the arc-shaped track
    r = ball["radius"]
    #Disable Phase2 for linear motion only
    if not phase2_enabled or R <= 0:
        ball["x"] += ball["vx"] #uniform linear motion
        #Boundary rebound (without collision)
        if not ball_collision_happened:
            if ball["x"] - r < 0:
                ball["x"] = r
                ball["vx"] = abs(ball["vx"])
            elif ball["x"] + r > TRACK_WIDTH:
                ball["x"] = TRACK_WIDTH - r
                ball["vx"] = -abs(ball["vx"])
        return
    #Phase2 enables -> linear + arc orbit motion
    left_end = R
    right_end = TRACK_WIDTH - R
    R_eff = max(1, R - r) #Effective arc track radius (minus the radius of the small ball)
    if ball["zone"] == "straight":
        ball["x"] += ball["vx"] #Uniform linear motion in a straight path
        #Rebound at the straight-line track boundary
        if not ball_collision_happened:
            if ball["x"] - r < left_end:
                ball["x"] = left_end
                ball["vx"] = abs(ball["vx"])
            elif ball["x"] + r > right_end:
                ball["x"] = right_end
                ball["vx"] = -abs(ball["vx"])
        #Enter the left arc track
        if ball["vx"] < 0 and ball["x"] <= left_end:
            ball["zone"] = "left_arc"
            ball["arc_alpha"] = pi / 2 #Initial Angle (90 degrees)
            ball["arc_v0"] = abs(ball["vx"]) #Initial velocity upon entering the arc shape
            ball["vy"] = 0.0
            #Initialization of arc track coordinates (trigonometric functions)
            ball["x"] = R + R_eff * cos(pi / 2)
            ball["y"] = GROUND_Y - R + R_eff * sin(pi / 2) + r
        #Enter the right arc track
        elif ball["vx"] > 0 and ball["x"] >= right_end:
            ball["zone"] = "right_arc"
            ball["arc_alpha"] = pi / 2
            ball["arc_v0"] = abs(ball["vx"])
            ball["vy"] = 0.0
            ball["x"] = TRACK_WIDTH - R + R_eff * cos(pi / 2)
            ball["y"] = GROUND_Y - R + R_eff * sin(pi / 2) + r
    #Left arc-shaped orbit motion (gravitational acceleration)
    elif ball["zone"] == "left_arc":
        if ball["stopped"]:
            return
        alpha = ball["arc_alpha"]
        v0 = ball["arc_v0"]
        #Gravitational potential energy is converted into kinetic energy
        v_sq = v0 * v0 - 2 * g * R_eff * (1 - sin(alpha))
        if v_sq <= 0: #Stop moving when the speed is less than or eaqual to 0
            ball["stopped"] = True
            sin_stop = 1 - v0 * v0 / (2 * g * R_eff)
            ball["arc_alpha"] = pi - asin(max(-1, min(1, sin_stop)))
            alpha = ball["arc_alpha"]
        else: #Update angle when the speed is greater than 0
            v = sqrt(v_sq)
            d_alpha = v / R_eff
            ball["arc_alpha"] = min(3 * pi / 2, alpha + d_alpha)
            alpha = ball["arc_alpha"]
        #Arc track coordinate update (Trigonometric functions)
        ball["x"] = R + R_eff * cos(alpha)
        ball["y"] = GROUND_Y - R + R_eff * sin(alpha) + r
    #Right arc-shaped track movement (the logic is the same as the left, but the Angle is reversed
    elif ball["zone"] == "right_arc":
        if ball["stopped"]:
            return
        alpha = ball["arc_alpha"]
        v0 = ball["arc_v0"]
        v_sq = v0 * v0 - 2 * g * R_eff * (1 - sin(alpha))
        if v_sq <= 0:
            ball["stopped"] = True
            sin_stop = 1 - v0 * v0 / (2 * g * R_eff)
            ball["arc_alpha"] = asin(max(-1, min(1, sin_stop)))
            alpha = ball["arc_alpha"]
        else:
            v = sqrt(v_sq)
            d_alpha = -v / R_eff #Reverse change in angle direction
            ball["arc_alpha"] = max(-pi / 2, alpha + d_alpha)
            alpha = ball["arc_alpha"]
        ball["x"] = TRACK_WIDTH - R + R_eff * cos(alpha)
        ball["y"] = GROUND_Y - R + R_eff * sin(alpha) + r


def resolve_collision(b1, b2):
    global ball_collision_happened, momentum_before_collision, energy_before_collision
    if paused or balls_stopped:
        return

    #Detects only on straights and without collisions (curved tracks do not trigger collisions)
    if phase2_enabled and (b1["zone"] != "straight" or b2["zone"] != "straight"):
        return

    #Collision detection core logic: calculate the horizontal distance between the centers of the two balls
    dx = b2["x"] - b1["x"]
    dist = abs(dx)

    #Distance >= the sum of two ball radius -> no collision; Speed direction judgment avoids false detection
    if dist >= b1["radius"] + b2["radius"]:
        return
    if (dx > 0 and b1["vx"] <= b2["vx"]) or (dx < 0 and b1["vx"] >= b2["vx"]):
        return

    #Record the momentum and kinetic energy before the collision
    if momentum_before_collision is None:
        momentum_before_collision = b1["mass"] * b1["vx"] + b2["mass"] * b2["vx"]
    if energy_before_collision is None:
        energy_before_collision = 0.5 * b1["mass"] * b1["vx"] ** 2 + 0.5 * b2["mass"] * b2["vx"] ** 2

    #Collision physics calculation: conservation of momentum
    m1, v1 = b1["mass"], b1["vx"]
    m2, v2 = b2["mass"], b2["vx"]
    m_total = m1 + m2

    #Elastic collision: Conservation of momentum and kinetic energy; Inelastic collision: Co-velocity
    if mode == "elastic":
        b1["vx"] = (v1 * (m1 - m2) + 2 * m2 * v2) / m_total
        b2["vx"] = (v2 * (m2 - m1) + 2 * m1 * v1) / m_total
    else:
        v_common = (m1 * v1 + m2 * v2) / m_total
        b1["vx"] = v_common
        b2["vx"] = v_common

    #Solve the problem of small ball adhesion after collision: Calculate the overlapping distance and reverse offset
    overlap = b1["radius"] + b2["radius"] - dist
    step = overlap / 2 #Offset each by half of the overlapping distance
    if dx > 0:
        b1["x"] -= step
        b2["x"] += step
    else:
        b1["x"] += step
        b2["x"] -= step

    ball_collision_happened = True #Mark that a collision has occurred


def get_momentum_before():
    if not ball_collision_happened:
        return blue_ball["mass"] * blue_ball["vx"] + pink_ball["mass"] * pink_ball["vx"]
    return momentum_before_collision

def get_ball_vx(ball):
    if ball["zone"] == "straight":
        return ball["vx"]
    if ball["stopped"]:
        return 0.0
    v = get_ball_speed(ball)
    alpha = ball["arc_alpha"]
    if ball["zone"] == "left_arc":
        return -v * sin(alpha)
    return v * sin(alpha)

def get_momentum_after():
    if not ball_collision_happened:
        return 0.0
    return blue_ball["mass"] * get_ball_vx(blue_ball) + pink_ball["mass"] * get_ball_vx(pink_ball)

def get_energy_before():
    if not ball_collision_happened:
        return 0.5 * blue_ball["mass"] * blue_ball["vx"] ** 2 + 0.5 * pink_ball["mass"] * pink_ball["vx"] ** 2
    return energy_before_collision

def get_energy_after():
    if not ball_collision_happened:
        return 0.0
    if mode == "elastic":
        v1 = get_ball_speed(blue_ball)
        v2 = get_ball_speed(pink_ball)
        return 0.5 * blue_ball["mass"] * v1 ** 2 + 0.5 * pink_ball["mass"] * v2 ** 2
    else:
        m_total = blue_ball["mass"] + pink_ball["mass"]
        v_com = (blue_ball["mass"] * get_ball_vx(blue_ball) + pink_ball["mass"] * get_ball_vx(pink_ball)) / m_total
        return 0.5 * m_total * v_com ** 2

#Data panel plotting (momentum/kinetic energy/velocity, etc.)
def draw_panel():
    pygame.draw.rect(screen, panel_color, (1070, 0, 500, HEIGHT)) #Panel background
    pygame.draw.line(screen, (180, 210, 255), (1070, 0), (1070, HEIGHT), 4)
    title = font_large.render("Control Panel", True, text_color)
    screen.blit(title, (1300 - title.get_width() // 2, 20))

    #Button drawing (color distinction for selected status)
    btn_color_sel = (80, 150, 220)
    btn_color_unsel = (200, 210, 235)
    btn_border = (120, 150, 200)
    pygame.draw.rect(screen, btn_color_sel if mode == "elastic" else btn_color_unsel, btn_elastic_rect)
    pygame.draw.rect(screen, btn_border, btn_elastic_rect, 2)
    txt_el = font_small.render("Elastic", True, text_color)
    screen.blit(txt_el,(btn_elastic_rect.centerx-txt_el.get_width()//2, btn_elastic_rect.centery-txt_el.get_height()//2))
    pygame.draw.rect(screen, btn_color_unsel if mode == "elastic" else btn_color_sel, btn_inelastic_rect)
    pygame.draw.rect(screen, btn_border, btn_inelastic_rect, 2)
    txt_in = font_small.render("Inelastic", True, text_color)
    screen.blit(txt_in,(btn_inelastic_rect.centerx-txt_in.get_width()//2,btn_inelastic_rect.centery-txt_in.get_height()//2))

    #Calculate momentum and kinetic energy data
    p_before = get_momentum_before()
    p_after  = get_momentum_after()
    e_before = get_energy_before()
    e_after  = get_energy_after()

    #Data text rendering
    info = [
        "Space - Pause / Resume",
        "R     - Reset Position",
        "",
        f"Momentum Before:  {p_before:+.2f}",
        f"Momentum After:   {p_after:+.2f}",
        "",
        f"Energy Before:    {e_before:.2f} J",
        f"Energy After:     {e_after:.2f} J",
        "",
        f"Blue velocity: {get_ball_vx(blue_ball):+.1f}",
        f"Pink velocity: {get_ball_vx(pink_ball):+.1f}",
    ]

    info_start_y = 435
    for i, line in enumerate(info):
        txt = font_small.render(line, True, text_color)
        screen.blit(txt, (1100, info_start_y + i * 26))

    #Draw slider
    for i, slider in enumerate(sliders):
        if i == 6 and not phase2_enabled:
            continue
        slider.draw()

    #Phase2 button drawing
    pygame.draw.rect(screen, (80, 150, 220) if phase2_enabled else (200, 210, 235), btn_phase2_rect)
    pygame.draw.rect(screen, (120, 150, 200), btn_phase2_rect, 2)
    txt_p2 = font_small.render("Phase 2: Semicircle Track", True, text_color)
    screen.blit(txt_p2, (btn_phase2_rect.centerx-txt_p2.get_width()//2,btn_phase2_rect.centery-txt_p2.get_height()//2))


running = True
while running:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        if event.type == pygame.MOUSEBUTTONDOWN:
            #Elastic/inelastic collision button clicks
            if btn_elastic_rect.collidepoint(event.pos):
                mode = "elastic"
                phase2_enabled = True
            elif btn_inelastic_rect.collidepoint(event.pos):
                mode = "inelastic"
                phase2_enabled = False
            #Phase2 switch button click
            elif btn_phase2_rect.collidepoint(event.pos):
                phase2_enabled = not phase2_enabled
        if event.type == pygame.KEYDOWN:
            #R key reset (shortcut)
            if event.key == pygame.K_r:
                #Reset the ball's position, speed, and state
                R = get_semicircle_R() if phase2_enabled else 0
                if phase2_enabled and R > 0:
                    left_end = R
                    right_end = TRACK_WIDTH - R
                    margin = 15
                    blue_ball["x"] = left_end + sliders[1].value + margin
                    pink_ball["x"] = right_end - sliders[3].value - margin
                else:
                    blue_ball["x"] = sliders[1].value
                    pink_ball["x"] = TRACK_WIDTH - sliders[3].value
                blue_ball["vx"] = reset_blue["vx"]
                pink_ball["vx"] = reset_pink["vx"]
                init_ball_phase2(blue_ball)
                init_ball_phase2(pink_ball)
                blue_ball["y"] = GROUND_Y
                pink_ball["y"] = GROUND_Y
                paused = False
                ball_collision_happened = False
                balls_stopped = False
                momentum_before_collision = None
                energy_before_collision = None
            #Space bar pause and continue (shortcut key)
            elif event.key == pygame.K_SPACE:
                paused = not paused

        #Slider update (real-time response to drag)
        for slider in sliders:
            slider.update(event)

    #Slider values are synchronized to the properties of the small ball (updated in real time)
    blue_ball["mass"], blue_ball["radius"] = sliders[0].value, sliders[1].value
    pink_ball["mass"], pink_ball["radius"] = sliders[2].value, sliders[3].value
    if not ball_collision_happened:
        sb = sliders[4].value
        sp = sliders[5].value
        blue_ball["vx"] = copysign(sb, blue_ball["vx"]) if blue_ball["vx"] != 0 else sb
        pink_ball["vx"] = copysign(sp, pink_ball["vx"]) if pink_ball["vx"] != 0 else -sp

    draw_background()
    move_ball(blue_ball)
    move_ball(pink_ball)
    resolve_collision(blue_ball, pink_ball)

    if phase2_enabled:
        if ball_collision_happened and blue_ball["stopped"] and pink_ball["stopped"]:
            balls_stopped = True
    else:
        blue_out = blue_ball["x"] - blue_ball["radius"] < 0 or blue_ball["x"] + blue_ball["radius"] > TRACK_WIDTH
        pink_out = pink_ball["x"] - pink_ball["radius"] < 0 or pink_ball["x"] + pink_ball["radius"] > TRACK_WIDTH
        if ball_collision_happened and (blue_out or pink_out):
            balls_stopped = True

    draw_ball(blue_ball)
    draw_ball(pink_ball)
    main_title = font_large.render("Collision Demo", True, (80, 120, 180))
    screen.blit(main_title, (500 - main_title.get_width() // 2, 60))
    draw_panel()
    pygame.display.flip()
    clock.tick(60)

pygame.quit()