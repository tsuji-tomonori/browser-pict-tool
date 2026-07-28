from __future__ import annotations

import re
import sys
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one match, got {count}')
    return text.replace(old, new, 1)


def replace_regex(text: str, pattern: str, replacement: str, label: str) -> str:
    out, count = re.subn(pattern, replacement, text, count=1, flags=re.MULTILINE | re.DOTALL)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one match, got {count}')
    return out


def main(path: str) -> None:
    target = Path(path)
    text = target.read_text(encoding='utf-8')

    # Photographic, video-derived materials created by source_texture_overlay.py.
    text = replace_once(
        text,
        "    'field_grass': solid_material('MAT_FieldGrass', (.10, .33, .09), roughness=.92, noise_scale=5, noise_strength=.25, bump_strength=.12),",
        "    'field_grass': solid_material('MAT_FieldGrass', (.075, .235, .062), roughness=.96, noise_scale=5, noise_strength=.20, bump_strength=.10),",
        'field grass colour',
    )
    text = replace_once(
        text,
        "    'curb': solid_material('MAT_CurbDark', (.17, .18, .17), roughness=.92, noise_scale=7, noise_strength=.35, bump_strength=.25),",
        "    'curb': image_material('MAT_CurbActual', 'curb_base.png', height_file='curb_height.png', roughness=.94, bump_strength=.38, mapping_scale=(1.4,1.4,1.4), use_uv=False),",
        'curb material',
    )
    text = replace_once(
        text,
        "    'bronze': solid_material('MAT_DarkBronze', (.14, .095, .055), roughness=.5, metallic=.55, noise_scale=5, noise_strength=.25, bump_strength=.2),",
        "    'bronze': image_material('MAT_DarkBronzeActual', 'bronze_base.png', height_file='bronze_height.png', roughness=.48, bump_strength=.34, mapping_scale=(1.55,1.55,1.55), use_uv=False, metallic=.58),",
        'bronze material',
    )
    text = replace_once(
        text,
        "    'red_granite': solid_material('MAT_RedGranite', (.38, .12, .10), roughness=.63, noise_scale=11, noise_strength=.55, bump_strength=.5),",
        "    'red_granite': image_material('MAT_RedGraniteActual', 'red_granite_base.png', height_file='red_granite_height.png', roughness=.62, bump_strength=.62, mapping_scale=(1.25,1.25,1.25), use_uv=False),",
        'red granite material',
    )
    text = replace_once(
        text,
        "    'slate': solid_material('MAT_WetSlate', (.075, .072, .065), roughness=.48, noise_scale=12, noise_strength=.35, bump_strength=.26),",
        "    'slate': image_material('MAT_SlateActual', 'slate_base.png', height_file='slate_height.png', roughness=.74, bump_strength=.38, mapping_scale=(1.6,1.6,1.6), use_uv=False),",
        'slate material',
    )
    text = replace_once(
        text,
        "MAT['hedge'] = solid_material('MAT_ClippedHedge', (.055,.255,.045), roughness=.92, noise_scale=8, noise_strength=.45, bump_strength=.38)\nMAT['hedge_light'] = solid_material('MAT_ClippedHedgeLight', (.085,.33,.055), roughness=.92, noise_scale=9, noise_strength=.42, bump_strength=.34)\nMAT['moss'] = solid_material('MAT_Moss', (.055,.18,.035), roughness=.98, noise_scale=12, noise_strength=.42, bump_strength=.25)",
        "MAT['hedge'] = image_material('MAT_ClippedHedgeActual', 'hedge_base.png', height_file='hedge_height.png', roughness=.94, bump_strength=.43, mapping_scale=(1.55,1.55,1.55), use_uv=False)\nMAT['hedge_light'] = image_material('MAT_ClippedHedgeLightActual', 'hedge_light_base.png', height_file='hedge_height.png', roughness=.94, bump_strength=.38, mapping_scale=(1.45,1.45,1.45), use_uv=False)\nMAT['moss'] = solid_material('MAT_Moss', (.035,.115,.025), roughness=.98, noise_scale=12, noise_strength=.34, bump_strength=.22)\nMAT['stucco_beige'] = solid_material('MAT_StuccoBeige', (.52,.40,.27), roughness=.91, noise_scale=7, noise_strength=.11, bump_strength=.12)\nMAT['wood_sculpt'] = solid_material('MAT_BrownOutdoorSculpture', (.20,.105,.055), roughness=.64, metallic=.20, noise_scale=7, noise_strength=.27, bump_strength=.30)\nMAT['face_recess'] = solid_material('MAT_FaceRecess', (.15,.145,.135), roughness=.87, noise_scale=6, noise_strength=.14, bump_strength=.12)",
        'hedge materials',
    )

    # Smooth all UV/icosphere props. The source video has rounded clipped foliage and sculptures,
    # not visible flat facets except on the red granite piece.
    text = replace_once(
        text,
        "    obj.data.materials.append(material)\n    move_to(obj, collection)\n    return obj\n\n\ndef ico_sphere",
        "    obj.data.materials.append(material)\n    for poly in obj.data.polygons:\n        poly.use_smooth = True\n    move_to(obj, collection)\n    return obj\n\n\ndef ico_sphere",
        'smooth UV spheres',
    )
    text = replace_once(
        text,
        "    obj.data.materials.append(material)\n    move_to(obj, collection)\n    return obj\n\n\ndef bar_between",
        "    obj.data.materials.append(material)\n    for poly in obj.data.polygons:\n        poly.use_smooth = True\n    move_to(obj, collection)\n    return obj\n\n\ndef bar_between",
        'smooth ico spheres',
    )

    vegetation = r'''def make_tree(name: str, x: float, y: float, height: float, crown: float, seed: int, collection: str='VEGETATION', leaf_density: float=1.0):
    rng=random.Random(seed)
    verts=[];faces=[];uvs=[]
    lean=Vector((rng.uniform(-.7,.7),rng.uniform(-.7,.7),0))
    trunk_pts=[Vector((x,y,0.02)),Vector((x+lean.x*.25,y+lean.y*.25,height*.27)),Vector((x+lean.x*.55,y+lean.y*.55,height*.48))]
    append_tapered_segment(verts,faces,uvs,trunk_pts[0],trunk_pts[1],height*.052,height*.042,14,v_scale=2.8)
    append_tapered_segment(verts,faces,uvs,trunk_pts[1],trunk_pts[2],height*.043,height*.030,14,v_start=height*.27/2.8,v_scale=2.8)
    for ri in range(6):
        a=2*math.pi*ri/6+rng.uniform(-.22,.22)
        start=Vector((x+math.cos(a)*height*.025,y+math.sin(a)*height*.025,.08))
        end=Vector((x+math.cos(a)*height*.14,y+math.sin(a)*height*.14,.015))
        append_tapered_segment(verts,faces,uvs,start,end,height*.029,.007,9,v_scale=2)
    tips=[]
    branch_count=8+rng.randrange(3)
    for bi in range(branch_count):
        angle=2*math.pi*bi/branch_count+rng.uniform(-.34,.34)
        start_z=height*rng.uniform(.31,.51)
        start=Vector((x+lean.x*(start_z/height),y+lean.y*(start_z/height),start_z))
        length=crown*rng.uniform(.72,1.08)
        end=Vector((start.x+math.cos(angle)*length,start.y+math.sin(angle)*length,height*rng.uniform(.70,.93)))
        mid=start.lerp(end,.50)+Vector((rng.uniform(-.35,.35),rng.uniform(-.35,.35),height*rng.uniform(.04,.105)))
        append_tapered_segment(verts,faces,uvs,start,mid,height*.030,height*.017,11,v_scale=2.5)
        append_tapered_segment(verts,faces,uvs,mid,end,height*.018,height*.007,10,v_start=(mid-start).length/2.5,v_scale=2.5)
        tips.append(end)
        for sj in range(3):
            sa=angle+rng.uniform(-.82,.82)
            sstart=mid.lerp(end,rng.uniform(.20,.72))
            send=sstart+Vector((math.cos(sa)*crown*rng.uniform(.28,.56),math.sin(sa)*crown*rng.uniform(.28,.56),height*rng.uniform(.08,.21)))
            append_tapered_segment(verts,faces,uvs,sstart,send,height*.011,height*.0038,8,v_scale=2)
            tips.append(send)
    trunk=mesh_object(name+'_Wood',verts,faces,MAT['bark'],collection,uvs=uvs)
    for poly in trunk.data.polygons:
        poly.use_smooth=True

    # Dense, small crossed leaf cards form a continuous canopy. This avoids both
    # low-poly green balls and the sparse pom-pom look of the previous build.
    lv=[];lf=[];luv=[]
    cluster_count=max(28,int((38+rng.randrange(14))*leaf_density))
    cluster_positions=tips[:]
    while len(cluster_positions)<cluster_count:
        a=rng.uniform(0,2*math.pi);rad=crown*math.sqrt(rng.random())*.94
        cluster_positions.append(Vector((x+lean.x*.6+math.cos(a)*rad,y+lean.y*.6+math.sin(a)*rad,height*rng.uniform(.56,.99))))
    for ci,p in enumerate(cluster_positions[:cluster_count]):
        w=crown*rng.uniform(.34,.55);h=w*rng.uniform(.70,.98)
        rot=rng.uniform(0,math.pi)
        for cross in range(4):
            ang=rot+cross*math.pi/4
            right=Vector((math.cos(ang),math.sin(ang),0))*w*.5
            up=Vector((0,0,h*.5))+Vector((math.cos(ang+math.pi/2),math.sin(ang+math.pi/2),0))*rng.uniform(-.10,.10)*h
            base=len(lv)
            lv.extend([tuple(p-right-up),tuple(p+right-up),tuple(p+right+up),tuple(p-right+up)])
            lf.append((base,base+1,base+2,base+3));luv.append([(0,0),(1,0),(1,1),(0,1)])
    leaf_mat=MAT[['leaf_a','leaf_b','leaf_c'][seed%3]]
    leaves=mesh_object(name+'_Leaves',lv,lf,leaf_mat,collection,uvs=luv)
    return trunk,leaves


def make_hedge(name: str, points: Sequence[Sequence[float]], width: float=1.45, height: float=1.25, material=None):
    material=material or MAT['hedge']
    pts=catmull_rom(points,6,False)
    for i,(a,b) in enumerate(zip(pts,pts[1:])):
        d=b-a
        length=d.length
        obj=sphere(
            f'{name}_{i}',
            ((a.x+b.x)/2,(a.y+b.y)/2,height*.52),
            (length*.57+.22,width*.60,height*.54),
            material,'VEGETATION',segments=20,rings=10,
        )
        obj.rotation_euler[2]=math.atan2(d.y,d.x)
        # Smaller upper volume breaks the mathematically perfect capsule outline.
        if i % 2 == 0:
            top=sphere(
                f'{name}_Top_{i}',
                ((a.x+b.x)/2,(a.y+b.y)/2,height*.78),
                (length*.43+.15,width*.46,height*.26),
                material,'VEGETATION',segments=18,rings=9,
            )
            top.rotation_euler[2]=math.atan2(d.y,d.x)


def make_bush(name: str, x: float, y: float, radius: float, seed: int, light: bool=False):
    rng=random.Random(seed)
    material=MAT['hedge_light' if light else 'hedge']
    parts=[]
    for i,(ox,oy,scale) in enumerate(((0,0,1.0),(-.34,.12,.72),(.31,-.16,.68))):
        obj=sphere(
            f'{name}_{i}',
            (x+ox*radius,y+oy*radius,radius*(.64 if i==0 else .58)),
            (radius*scale*rng.uniform(.92,1.08),radius*scale*rng.uniform(.86,1.08),radius*scale*rng.uniform(.70,.88)),
            material,'VEGETATION',segments=22,rings=11,
        )
        parts.append(obj)
    return parts[0]


# Hedges defining'''
    text = replace_regex(
        text,
        r"^def make_tree\(.*?^# Hedges defining",
        vegetation,
        'vegetation functions',
    )

    # Reduce transparent grass cards that previously appeared to grow through the paving.
    text = replace_once(
        text,
        "    zones=[(63,13,8,7),(54,45,11,8),(72,-21,8,6),(55,-39,8,6),(79,48,7,5)]\n    count=0\n    for zx,zy,rx,ry in zones:\n        for _ in range(180):",
        "    zones=[(63,13,5.4,4.2),(54,45,7.5,5.2),(72,-21,5.0,3.8),(59,-41,4.2,3.2),(79,48,4.6,3.5)]\n    count=0\n    for zx,zy,rx,ry in zones:\n        for _ in range(58):",
        'grass zone density',
    )
    text = replace_once(
        text,
        "            w=rng.uniform(.22,.42);h=rng.uniform(.55,1.15);ang=rng.uniform(0,math.pi)",
        "            w=rng.uniform(.16,.31);h=rng.uniform(.28,.72);ang=rng.uniform(0,math.pi)",
        'grass card dimensions',
    )

    # Surroundings behind the elephant-like bronze are among the strongest recognition cues.
    text = replace_once(
        text,
        "simple_house('EastMediterranean',108,48,11,9,6.5,MAT['brick'],MAT['roof_red'],arched=True)",
        "simple_house('EastMediterranean',108,48,11,9,6.5,MAT['stucco_beige'],MAT['roof_red'],arched=True)\n# Gray glass-fronted office visible immediately left of the arched house.\ncube('EastGlassOffice_Core',(108,60,6.4),(15,10,12.8),MAT['white'],'SURROUNDINGS',bevel=.06)\nfor z in (2.0,4.8,7.6,10.4):\n    for yy in (56.5,59.0,61.5,64.0):\n        cube(f'EastGlassOffice_Pane_{z}_{yy}',(100.44,yy,z),(0.10,2.15,2.25),MAT['glass'],'SURROUNDINGS',bevel=.025)\ncube('EastGlassOffice_RedBand',(100.35,60,1.05),(.12,10,.72),MAT['roof_red'],'SURROUNDINGS')",
        'east background buildings',
    )

    bronze = r'''def bronze_drooping_sculpture(x=78.5,y=49.0):
    cube('BronzeDroop_Pedestal',(x,y,1.25),(1.62,1.62,2.5),MAT['paint_black'],'SCULPTURES',bevel=.045)
    # Rounded elephant/helmet-like body with a hollowed underside and a long down-curving trunk.
    body=sphere('BronzeDroop_Body',(x+.12,y,4.12),(1.18,.78,.73),MAT['bronze'],'SCULPTURES',segments=40,rings=20)
    ear=sphere('BronzeDroop_Ear',(x-.58,y-.03,4.10),(.64,.82,.77),MAT['bronze'],'SCULPTURES',segments=36,rings=18)
    support=variable_tube('BronzeDroop_Support',[(x-.20,y,2.50),(x-.18,y,3.15),(x-.08,y,3.62)],[.34,.31,.42],MAT['bronze'],'SCULPTURES',elliptical=.72,sides=24)
    trunk_pts=[(x+.76,y,4.20),(x+1.18,y,3.90),(x+1.36,y,3.45),(x+1.30,y,2.94),(x+1.02,y,2.73)]
    variable_tube('BronzeDroop_Trunk',trunk_pts,[.35,.32,.27,.21,.15],MAT['bronze'],'SCULPTURES',elliptical=.78,sides=24)
    sphere('BronzeDroop_Brow',(x+.30,y-.69,4.23),(.42,.08,.20),MAT['bronze'],'SCULPTURES',segments=28,rings=12)
    sphere('BronzeDroop_EyeRecess',(x+.25,y-.755,4.18),(.17,.045,.10),MAT['paint_black'],'SCULPTURES',segments=24,rings=10)
    plaque('BronzeDroop_Plaque',x,y-.85,1.26)
bronze_drooping_sculpture()'''
    text = replace_regex(text, r"^def bronze_drooping_sculpture\(.*?^bronze_drooping_sculpture\(\)", bronze, 'bronze sculpture')

    water = r'''def water_garden(x=55.0,y=44.0):
    # Dark, mostly dry slate installation with irregular joints and a rusted open basin.
    apron=[(x-8.2,y-5.2),(x-5.2,y-7.1),(x+3.2,y-6.6),(x+8.1,y-3.1),(x+7.2,y+3.1),(x+2.0,y+5.6),(x-5.2,y+5.0)]
    polygon_surface('WaterGarden_Slate',apron,.13,MAT['slate'],'SCULPTURES',uv_scale=3.2)
    for i in range(13):
        rx=x-6.4+i*1.08;ry=y+3.35+math.sin(i*.8)*.55
        rr=random.Random(5000+i).uniform(.55,1.02)
        irregular_rock(f'WaterGarden_Rock_{i}',(rx,ry,.42),(rr,rr*.76,rr*.68),5000+i)
    cube('WaterGarden_RustedBasin',(x,y,.70),(3.15,3.15,1.30),MAT['rust'],'SCULPTURES',bevel=.08)
    cube('WaterGarden_BasinOpening',(x,y,1.37),(2.52,2.52,.11),MAT['slate'],'SCULPTURES',bevel=.07)
    # A tall asymmetric pale monolith; black circular insets face the path.
    main=cube('WaterGarden_Monolith',(x,y+.12,2.92),(1.20,.76,3.15),MAT['stone_sculpture'],'SCULPTURES',rot_z=math.radians(-7),bevel=.13)
    side=cube('WaterGarden_MonolithSide',(x-.50,y+.08,2.62),(.52,.70,2.22),MAT['white'],'SCULPTURES',rot_z=math.radians(-7),bevel=.08)
    for j,z in enumerate((2.10,2.80,3.46)):
        cylinder(f'WaterGarden_Disc_{j}',(x+.07,y-.30,z),.25,.055,MAT['paint_black'],'SCULPTURES',vertices=36,rotation=(math.pi/2,0,0))
    rope_pts=[]
    for i,(px,py) in enumerate([(x-8,y-5),(x-5,y+5),(x+2,y+5.5),(x+8,y-3),(x+3,y-6.5)]):
        cylinder(f'WaterGarden_Post_{i}',(px,py,.62),.045,1.2,MAT['paint_black'],'PROPS',vertices=10)
        rope_pts.append((px,py,1.02))
    rope_pts.append(rope_pts[0]);curve_polyline('WaterGarden_Rope',rope_pts,.018,MAT['paint_black'],'PROPS')
    plaque('WaterGarden_Plaque',x-1.7,y-1.66,.36)
water_garden()'''
    text = replace_regex(text, r"^def water_garden\(.*?^water_garden\(\)", water, 'water garden')

    black = r'''def black_sphere_sculpture(x=78.0,y=4.0):
    cube('BlackSphere_Base',(x,y,.42),(5.15,2.12,.84),MAT['dark_concrete'],'SCULPTURES',bevel=.07)
    # Long horizontal animal/bench-like bronze: high tail at left, low body, ball at right.
    cube('BlackSphere_Tail',(x-1.70,y,2.30),(1.05,1.24,2.55),MAT['paint_black'],'SCULPTURES',bevel=.36)
    body=cube('BlackSphere_Body',(x-.05,y,1.86),(3.65,1.22,1.10),MAT['paint_black'],'SCULPTURES',bevel=.42)
    cube('BlackSphere_RightSupport',(x+1.42,y,1.28),(.78,1.12,1.55),MAT['paint_black'],'SCULPTURES',bevel=.28)
    sphere('BlackSphere_Orb',(x+.90,y,3.03),(.62,.62,.62),MAT['paint_black'],'SCULPTURES',segments=40,rings=20)
    plaque('BlackSphere_Plaque',x+.55,y-1.13,.60)
black_sphere_sculpture()'''
    text = replace_regex(text, r"^def black_sphere_sculpture\(.*?^black_sphere_sculpture\(\)", black, 'black sphere sculpture')

    stone = r'''def stone_face_sculpture(x=69.0,y=-23.0):
    cube('StoneFace_Base',(x,y,.44),(3.75,2.38,.88),MAT['dark_concrete'],'SCULPTURES',bevel=.14)
    head=cube('StoneFace_Head',(x,y,2.35),(2.75,1.56,3.30),MAT['stone_sculpture'],'SCULPTURES',bevel=.70)
    # Deep vertical pill-shaped face visible from the paver road.
    sphere('StoneFace_Recess',(x,y-.805,2.40),(.73,.075,1.17),MAT['face_recess'],'SCULPTURES',segments=40,rings=20)
    sphere('StoneFace_Inner',(x,y-.858,2.40),(.50,.045,.86),MAT['stone_sculpture'],'SCULPTURES',segments=36,rings=18)
    cube('StoneFace_HorizontalSeam',(x,y-.905,2.42),(1.00,.035,.10),MAT['face_recess'],'SCULPTURES',bevel=.025)
    plaque('StoneFace_Plaque',x,y-1.28,.56)
stone_face_sculpture()'''
    text = replace_regex(text, r"^def stone_face_sculpture\(.*?^stone_face_sculpture\(\)", stone, 'stone face sculpture')

    pavilion = r'''def pavilion_angular_sculpture(x=59.0,y=-41.0):
    cube('PavilionSculpt_Base',(x,y,.32),(2.3,2.0,.64),MAT['dark_concrete'],'SCULPTURES',bevel=.08)
    verts=[(-.78,-.56,0),(.66,-.55,0),(.96,.15,.30),(.30,.62,.25),(-.66,.45,.10),
           (-.20,-.20,3.80),(.46,-.05,3.20),(.66,.36,2.50),(-.56,.31,2.92)]
    faces=[(0,1,2,3,4),(0,5,6,1),(1,6,7,2),(2,7,8,3),(3,8,5,4),(4,5,0),(5,8,7,6)]
    obj=mesh_object('PavilionSculpt_Form',[(x+vx,y+vy,.6+vz) for vx,vy,vz in verts],faces,MAT['wood_sculpt'],'SCULPTURES')
    add_bevel(obj,.075,2);plaque('PavilionSculpt_Plaque',x,y-1.12,.45)
pavilion_angular_sculpture()'''
    text = replace_regex(text, r"^def pavilion_angular_sculpture\(.*?^pavilion_angular_sculpture\(\)", pavilion, 'pavilion sculpture')

    # Darker, softer natural light with enough contrast for dappled tree shadows.
    text = replace_once(text, "bg.inputs['Strength'].default_value=.52", "bg.inputs['Strength'].default_value=.31", 'world strength')
    text = replace_once(text, "sun.data.energy=2.15", "sun.data.energy=1.48", 'sun energy')
    text = replace_once(text, "fill.data.energy=500", "fill.data.energy=145", 'fill energy')
    text = replace_once(
        text,
        "scene.render.image_settings.color_mode = 'RGBA'",
        "scene.render.image_settings.color_mode = 'RGBA'\nscene.view_settings.exposure = -0.42",
        'exposure',
    )

    old_cameras = """CAMERA_SPECS=[
    # Video-matched references.
    ('Ref_0054_Bronze',(68.0,43.0,1.62),(78.7,49.0,2.55),30),
    ('Ref_0060_WaterGarden',(69.0,39.0,1.62),(55.0,44.0,1.55),29),
    ('Ref_0180_RedGranite',(71.0,7.0,1.58),(63.0,14.0,1.95),29),
    ('Ref_0188_BlackSphere',(67.0,-.5,1.62),(78.0,4.0,1.85),30),
    ('Ref_0194_VendingEntrance',(70.0,3.5,1.56),(86.0,6.0,1.45),28),
    ('Ref_0274_NWBuildings',(-96.0,42.0,1.62),(-82.0,43.0,1.75),31),
    ('Ref_0342_StoneFace',(61.0,-34.0,1.55),(69.0,-23.0,1.85),29),
    ('Ref_0406_Pavilion',(73.0,-55.0,1.55),(57.0,-43.0,1.65),29),
    ('Ref_0434_BenchPath',(49.0,-62.0,1.58),(70.0,-57.0,1.45),29),
    ('Ref_0448_MapJunction',(67.0,-63.0,1.58),(80.0,-57.0,1.62),30),
    # Validation and showcase views.
    ('Show_Baseball',(35.0,-28.0,4.0),(-20.0,22.0,1.1),33),
    ('Show_EastPlayground',(88.0,30.0,2.2),(75.0,34.0,1.8),31),
    ('Show_EastEntrance',(104.0,2.0,2.0),(89.0,-3.0,1.5),32),
    ('Show_Aerial',(116.0,-125.0,138.0),(0.0,0.0,0.0),44),
]"""
    new_cameras = """CAMERA_SPECS=[
    # Video-grounded route views. Positions avoid trees/hedges while preserving the source sequence.
    ('Ref_0054_Bronze',(68.0,43.0,1.58),(78.7,49.0,3.20),37),
    ('Ref_0060_WaterGarden',(69.0,39.0,1.57),(55.0,44.0,1.75),35),
    ('Ref_0180_RedGranite',(70.0,7.2,1.48),(63.0,14.0,1.86),36),
    ('Ref_0188_BlackSphere',(68.0,-1.0,1.52),(78.0,4.0,1.95),37),
    ('Ref_0194_VendingEntrance',(72.0,-1.0,1.48),(85.0,5.2,1.45),34),
    ('Ref_0274_NWBuildings',(-96.0,31.0,1.55),(-82.0,43.0,1.85),34),
    ('Ref_0342_StoneFace',(54.0,-34.0,1.48),(69.0,-23.0,2.05),36),
    ('Ref_0406_Pavilion',(72.0,-60.0,1.48),(57.0,-46.0,1.55),34),
    ('Ref_0434_BenchPath',(50.0,-61.0,1.50),(72.0,-57.0,1.35),34),
    ('Ref_0448_MapJunction',(53.0,-62.0,1.50),(79.0,-57.0,1.48),35),
    # Validation and showcase views.
    ('Show_Baseball',(35.0,-28.0,4.0),(-20.0,22.0,1.1),36),
    ('Show_EastPlayground',(94.0,26.0,2.0),(75.0,34.0,1.8),35),
    ('Show_EastEntrance',(98.0,-2.0,1.72),(89.0,-3.0,1.35),38),
    ('Show_Aerial',(116.0,-125.0,138.0),(0.0,0.0,0.0),44),
]"""
    text = replace_once(text, old_cameras, new_cameras, 'camera list')

    text = replace_once(text, "'revision':'video-grounded-realistic-v2'", "'revision':'video-grounded-realistic-v3'", 'manifest revision')
    text = text.replace("'video-grounded-realistic-v2'", "'video-grounded-realistic-v3'")

    target.write_text(text, encoding='utf-8')
    print(f'Patched {target}: {len(text)} bytes')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('usage: patch_v3.py PATH_TO_BUILDER')
    main(sys.argv[1])
