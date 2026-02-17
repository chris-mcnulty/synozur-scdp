#!/usr/bin/env python3
"""
Generate a branded PowerPoint status report from AI-generated narrative content.
Reads JSON data from stdin, outputs PPTX to the path specified as first argument.
"""

import sys
import json
import os
import re
from datetime import datetime, timedelta
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

FONT_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'client', 'public', 'fonts')
FONT_NAME = 'Avenir Next LT Pro'

SLIDE_WIDTH = Inches(13.333)
SLIDE_HEIGHT = Inches(7.5)

def hex_to_rgb(hex_str):
    hex_str = hex_str.lstrip('#')
    return RGBColor(int(hex_str[0:2], 16), int(hex_str[2:4], 16), int(hex_str[4:6], 16))

def set_font(run, size=10, bold=False, color=None, name=FONT_NAME, italic=False):
    run.font.name = name
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.italic = italic
    if color:
        run.font.color.rgb = color if isinstance(color, RGBColor) else hex_to_rgb(color)

def set_cell_text(cell, text, size=9, bold=False, color=None, bg_color=None, alignment=PP_ALIGN.LEFT, valign=MSO_ANCHOR.MIDDLE):
    cell.text = ""
    tf = cell.text_frame
    tf.word_wrap = True
    tf.auto_size = None
    p = tf.paragraphs[0]
    p.alignment = alignment
    run = p.add_run()
    run.text = str(text)
    set_font(run, size=size, bold=bold, color=color)
    cell.vertical_anchor = valign
    if bg_color:
        cell.fill.solid()
        cell.fill.fore_color.rgb = bg_color if isinstance(bg_color, RGBColor) else hex_to_rgb(bg_color)

def add_accent_bar(slide, primary_color, left=0, top=0, width=None, height=Inches(0.08)):
    if width is None:
        width = SLIDE_WIDTH
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
    shape.fill.solid()
    shape.fill.fore_color.rgb = hex_to_rgb(primary_color)
    shape.line.fill.background()
    return shape

def parse_markdown_sections(md_text):
    """Parse AI-generated markdown into structured sections."""
    sections = {}
    current_section = None
    current_content = []

    for line in md_text.split('\n'):
        if line.startswith('## '):
            if current_section:
                sections[current_section] = '\n'.join(current_content).strip()
            current_section = line[3:].strip()
            current_content = []
        else:
            current_content.append(line)

    if current_section:
        sections[current_section] = '\n'.join(current_content).strip()

    return sections

def parse_bullet_items(text):
    """Parse markdown bullet items into structured data with bold titles and descriptions."""
    items = []
    current_item = None

    for line in text.split('\n'):
        stripped = line.strip()
        if not stripped:
            continue

        if stripped.startswith('- ') or stripped.startswith('* ') or stripped.startswith('• '):
            if current_item:
                items.append(current_item)
            content = stripped[2:].strip()
            bold_match = re.match(r'\*\*(.+?)\*\*\s*[-–—:]?\s*(.*)', content)
            if bold_match:
                current_item = {
                    'title': bold_match.group(1).strip(),
                    'description': bold_match.group(2).strip(),
                    'sub_items': []
                }
            else:
                current_item = {
                    'title': content,
                    'description': '',
                    'sub_items': []
                }
        elif stripped.startswith('  - ') or stripped.startswith('  * ') or stripped.startswith('  • '):
            if current_item:
                sub_content = stripped.lstrip(' -•*').strip()
                current_item['sub_items'].append(sub_content)
        elif current_item:
            if current_item['description']:
                current_item['description'] += ' ' + stripped
            else:
                current_item['description'] = stripped

    if current_item:
        items.append(current_item)

    return items

def render_markdown_text(tf, text, primary_color, size=10, start_fresh=True):
    """Render markdown text with bold formatting into a text frame."""
    if start_fresh and tf.paragraphs[0].text == '':
        started = False
    else:
        started = True

    lines = text.split('\n')
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        if started:
            p = tf.add_paragraph()
        else:
            p = tf.paragraphs[0]
            started = True

        p.space_after = Pt(3)
        p.space_before = Pt(2)

        if stripped.startswith('- ') or stripped.startswith('• ') or stripped.startswith('* '):
            content = stripped[2:].strip()
            render_inline_bold(p, f"• {content}", size=size, primary_color=primary_color)
        elif stripped.startswith('  - ') or stripped.startswith('  • '):
            content = stripped.lstrip(' -•*').strip()
            p.level = 1
            render_inline_bold(p, f"  – {content}", size=size - 1, primary_color=primary_color)
        else:
            render_inline_bold(p, stripped, size=size, primary_color=primary_color)

def render_inline_bold(p, text, size=10, primary_color=None):
    """Render text with **bold** markdown formatting into a paragraph."""
    parts = re.split(r'(\*\*[^*]+\*\*)', text)
    for part in parts:
        if part.startswith('**') and part.endswith('**'):
            run = p.add_run()
            run.text = part[2:-2]
            set_font(run, size=size, bold=True, color=primary_color)
        else:
            if part:
                run = p.add_run()
                run.text = part
                set_font(run, size=size)

def create_title_slide(prs, data, primary_color, secondary_color):
    slide = prs.slides.add_slide(prs.slide_layouts[6])

    bg_shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, SLIDE_WIDTH, SLIDE_HEIGHT)
    bg_shape.fill.solid()
    bg_shape.fill.fore_color.rgb = hex_to_rgb(primary_color)
    bg_shape.line.fill.background()

    accent = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, Inches(5.0), SLIDE_WIDTH, Inches(0.06))
    accent.fill.solid()
    accent.fill.fore_color.rgb = hex_to_rgb(secondary_color)
    accent.line.fill.background()

    txBox = slide.shapes.add_textbox(Inches(1), Inches(2.0), Inches(11), Inches(2.0))
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.LEFT
    run = p.add_run()
    run.text = data.get('projectName', 'Project Status Report')
    set_font(run, size=36, bold=True, color=RGBColor(255, 255, 255))

    p2 = tf.add_paragraph()
    run2 = p2.add_run()
    run2.text = "STATUS REPORT"
    set_font(run2, size=20, color=RGBColor(220, 220, 220))

    txBox2 = slide.shapes.add_textbox(Inches(1), Inches(4.2), Inches(8), Inches(1.2))
    tf2 = txBox2.text_frame
    tf2.word_wrap = True
    p = tf2.paragraphs[0]
    run = p.add_run()
    run.text = data.get('clientName', '')
    set_font(run, size=16, bold=True, color=RGBColor(255, 255, 255))

    period_start = data.get('periodStart', '')
    period_end = data.get('periodEnd', '')
    report_date = data.get('reportDate', datetime.now().strftime('%B %d, %Y'))
    period_text = f"Period: {period_start} to {period_end}" if period_start and period_end else report_date

    p2 = tf2.add_paragraph()
    run2 = p2.add_run()
    run2.text = period_text
    set_font(run2, size=14, color=RGBColor(230, 230, 230))

    p3 = tf2.add_paragraph()
    run3 = p3.add_run()
    pm_name = data.get('pmName', '')
    run3.text = f"Project Manager: {pm_name}" if pm_name else report_date
    set_font(run3, size=12, color=RGBColor(200, 200, 200))

    logo_path = data.get('logoPath')
    if logo_path and os.path.exists(logo_path):
        try:
            slide.shapes.add_picture(logo_path, Inches(10.5), Inches(4.0), height=Inches(0.8))
        except Exception:
            pass

    return slide

def create_progress_summary_slide(prs, data, sections, primary_color, secondary_color):
    """Slide 2: Progress Summary with AI-generated narrative."""
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    add_accent_bar(slide, primary_color, top=0)

    txBox = slide.shapes.add_textbox(Inches(0.8), Inches(0.3), Inches(10), Inches(0.6))
    tf = txBox.text_frame
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = "Progress Summary"
    set_font(run, size=24, bold=True, color=primary_color)

    metrics = data.get('metrics', {})
    if metrics:
        metrics_box = slide.shapes.add_textbox(Inches(0.8), Inches(1.0), Inches(11.5), Inches(0.5))
        tf_m = metrics_box.text_frame
        p = tf_m.paragraphs[0]
        items = []
        if metrics.get('totalHours', '0') != '0':
            items.append(f"Hours: {metrics['totalHours']} ({metrics.get('billableHours', '0')} billable)")
        if metrics.get('teamMembers', 0) > 0:
            items.append(f"Team: {metrics['teamMembers']} members")
        if metrics.get('totalExpenses', '0.00') != '0.00':
            items.append(f"Expenses: ${metrics['totalExpenses']}")
        if items:
            run = p.add_run()
            run.text = "  |  ".join(items)
            set_font(run, size=9, color='#666666')

    content_top = Inches(1.6) if metrics else Inches(1.2)
    content_box = slide.shapes.add_textbox(Inches(0.8), content_top, Inches(11.5), Inches(5.5))
    tf = content_box.text_frame
    tf.word_wrap = True

    desc = data.get('projectDescription', '')
    has_desc = False
    if desc:
        p = tf.paragraphs[0]
        run = p.add_run()
        run.text = "Project Overview"
        set_font(run, size=12, bold=True, color=primary_color)

        p2 = tf.add_paragraph()
        p2.space_before = Pt(2)
        p2.space_after = Pt(8)
        run2 = p2.add_run()
        run2.text = desc
        set_font(run2, size=10)
        has_desc = True

    summary_text = sections.get('Progress Summary', '')
    if summary_text:
        if has_desc:
            p_sep = tf.add_paragraph()
            p_sep.space_before = Pt(4)
            run_sep = p_sep.add_run()
            run_sep.text = "Period Update"
            set_font(run_sep, size=12, bold=True, color=primary_color)
        render_markdown_text(tf, summary_text, primary_color, size=11, start_fresh=not has_desc)

    milestones = data.get('milestonePosture', {})
    if milestones and any(milestones.values()):
        p = tf.add_paragraph()
        p.space_before = Pt(14)
        run = p.add_run()
        run.text = "Milestone Posture"
        set_font(run, size=12, bold=True, color=primary_color)

        for status_label, items in milestones.items():
            if items:
                p = tf.add_paragraph()
                p.space_before = Pt(2)
                run = p.add_run()
                run.text = f"• {status_label}: "
                set_font(run, size=10, bold=True)
                run2 = p.add_run()
                run2.text = ', '.join(items)
                set_font(run2, size=10)

    return slide

def create_accomplishments_slide(prs, data, sections, primary_color, secondary_color):
    """Slide 3: Key Accomplishments with rich AI narrative."""
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    add_accent_bar(slide, primary_color, top=0)

    txBox = slide.shapes.add_textbox(Inches(0.8), Inches(0.3), Inches(10), Inches(0.6))
    tf = txBox.text_frame
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = "Key Accomplishments"
    set_font(run, size=24, bold=True, color=primary_color)

    content_box = slide.shapes.add_textbox(Inches(0.8), Inches(1.1), Inches(11.5), Inches(6.0))
    tf = content_box.text_frame
    tf.word_wrap = True

    accomplishments_text = sections.get('Key Accomplishments', '')
    if accomplishments_text:
        items = parse_bullet_items(accomplishments_text)
        first = True
        for item in items:
            if first:
                p = tf.paragraphs[0]
                first = False
            else:
                p = tf.add_paragraph()

            p.space_before = Pt(6)
            p.space_after = Pt(2)

            run = p.add_run()
            run.text = f"• {item['title']}"
            set_font(run, size=11, bold=True, color=primary_color)

            if item.get('description'):
                p2 = tf.add_paragraph()
                p2.space_before = Pt(1)
                p2.space_after = Pt(4)
                run2 = p2.add_run()
                run2.text = f"  {item['description']}"
                set_font(run2, size=10)

            for sub in item.get('sub_items', []):
                p3 = tf.add_paragraph()
                p3.space_before = Pt(1)
                run3 = p3.add_run()
                run3.text = f"    – {sub}"
                set_font(run3, size=9, color='#444444')
    else:
        p = tf.paragraphs[0]
        run = p.add_run()
        run.text = "No accomplishments data available for this period."
        set_font(run, size=11, color='#888888')

    return slide

def create_raidd_slide(prs, data, sections, primary_color, secondary_color):
    """Slide 4: RAIDD Log with AI narrative and structured data."""
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    add_accent_bar(slide, primary_color, top=0)

    txBox = slide.shapes.add_textbox(Inches(0.8), Inches(0.3), Inches(10), Inches(0.6))
    tf = txBox.text_frame
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = "Risks, Issues & Key Decisions (RAIDD)"
    set_font(run, size=22, bold=True, color=primary_color)

    raidd_section_text = ''
    for key in sections:
        if 'raidd' in key.lower() or 'risk' in key.lower():
            raidd_section_text = sections[key]
            break

    content_box = slide.shapes.add_textbox(Inches(0.5), Inches(1.0), Inches(12.3), Inches(6.0))
    tf = content_box.text_frame
    tf.word_wrap = True

    if raidd_section_text:
        render_markdown_text(tf, raidd_section_text, primary_color, size=9)
    else:
        raidd = data.get('raidd', {})
        categories = [
            ('Risks', raidd.get('risks', [])),
            ('Issues', raidd.get('issues', [])),
            ('Action Items', raidd.get('actionItems', [])),
            ('Decisions', raidd.get('decisions', [])),
            ('Dependencies', raidd.get('dependencies', [])),
        ]

        first = True
        for cat_name, entries in categories:
            active_entries = [e for e in entries if e.get('status', '') in ('open', 'in_progress')]
            display = active_entries if active_entries else entries

            if first:
                p = tf.paragraphs[0]
                first = False
            else:
                p = tf.add_paragraph()
                p.space_before = Pt(8)

            run = p.add_run()
            run.text = cat_name
            set_font(run, size=11, bold=True, color=primary_color)

            if not display:
                p2 = tf.add_paragraph()
                run2 = p2.add_run()
                run2.text = f"  No active {cat_name.lower()} at this time."
                set_font(run2, size=9, color='#888888')
            else:
                for entry in display:
                    p2 = tf.add_paragraph()
                    p2.space_before = Pt(2)
                    ref = entry.get('refNumber', '')
                    title = entry.get('title', '')
                    priority = entry.get('priority', '')
                    status = entry.get('status', '')
                    owner = entry.get('ownerName', '')
                    due = entry.get('dueDate', '')
                    priority_tag = f" [{priority.upper()}]" if priority else ''

                    run2 = p2.add_run()
                    run2.text = f"  {ref} {title}{priority_tag} ({status})"
                    set_font(run2, size=9, bold=True)

                    details = []
                    if owner:
                        details.append(f"Owner: {owner}")
                    if due:
                        details.append(f"Due: {due}")
                    mitigation = entry.get('mitigationPlan', '')
                    if mitigation:
                        details.append(f"Mitigation: {mitigation}")

                    if details:
                        p3 = tf.add_paragraph()
                        run3 = p3.add_run()
                        run3.text = f"    {'; '.join(details)}"
                        set_font(run3, size=8, color='#555555')

    return slide

def create_upcoming_slide(prs, data, sections, primary_color, secondary_color):
    """Slide 5: Upcoming Activities with AI narrative."""
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    add_accent_bar(slide, primary_color, top=0)

    txBox = slide.shapes.add_textbox(Inches(0.8), Inches(0.3), Inches(10), Inches(0.6))
    tf = txBox.text_frame
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = "Upcoming Activities"
    set_font(run, size=24, bold=True, color=primary_color)

    content_box = slide.shapes.add_textbox(Inches(0.8), Inches(1.1), Inches(11.5), Inches(6.0))
    tf = content_box.text_frame
    tf.word_wrap = True

    upcoming_text = sections.get('Upcoming Activities', '')
    if upcoming_text:
        items = parse_bullet_items(upcoming_text)
        first = True
        for item in items:
            if first:
                p = tf.paragraphs[0]
                first = False
            else:
                p = tf.add_paragraph()

            p.space_before = Pt(6)
            p.space_after = Pt(2)

            run = p.add_run()
            run.text = f"• {item['title']}"
            set_font(run, size=11, bold=True, color=primary_color)

            if item.get('description'):
                p2 = tf.add_paragraph()
                p2.space_before = Pt(1)
                p2.space_after = Pt(4)
                run2 = p2.add_run()
                run2.text = f"  {item['description']}"
                set_font(run2, size=10)

            for sub in item.get('sub_items', []):
                p3 = tf.add_paragraph()
                p3.space_before = Pt(1)
                run3 = p3.add_run()
                run3.text = f"    – {sub}"
                set_font(run3, size=9, color='#444444')
    else:
        p = tf.paragraphs[0]
        run = p.add_run()
        run.text = "No upcoming activities data available."
        set_font(run, size=11, color='#888888')

    return slide

def create_timeline_slide(prs, data, primary_color, secondary_color):
    """Slide 6: Timeline & Milestones - Gantt chart with native PowerPoint shapes."""
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    add_accent_bar(slide, primary_color, top=0)

    txBox = slide.shapes.add_textbox(Inches(0.8), Inches(0.3), Inches(10), Inches(0.6))
    tf = txBox.text_frame
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = "Timeline & Milestones"
    set_font(run, size=24, bold=True, color=primary_color)

    timeline = data.get('timeline', {})
    epic_groups = timeline.get('epicGroups', [])
    unlinked_milestones = timeline.get('unlinkedMilestones', [])
    all_milestones = data.get('milestones', [])

    has_gantt_data = any(eg.get('stages') for eg in epic_groups)
    if not has_gantt_data and not unlinked_milestones and not all_milestones:
        note_box = slide.shapes.add_textbox(Inches(1), Inches(2), Inches(10), Inches(1))
        tf = note_box.text_frame
        p = tf.paragraphs[0]
        run = p.add_run()
        run.text = "No timeline data available for this project."
        set_font(run, size=12, color='#666666')
        return slide

    if not has_gantt_data:
        _draw_milestone_table_fallback(slide, all_milestones, primary_color)
        return slide

    all_dates = []
    for eg in epic_groups:
        for stage in eg.get('stages', []):
            if stage.get('startDate'):
                all_dates.append(stage['startDate'])
            if stage.get('endDate'):
                all_dates.append(stage['endDate'])
        for ms in eg.get('milestones', []):
            if ms.get('targetDate'):
                all_dates.append(ms['targetDate'])
    for ms in unlinked_milestones:
        if ms.get('targetDate'):
            all_dates.append(ms['targetDate'])

    if not all_dates:
        _draw_milestone_table_fallback(slide, all_milestones, primary_color)
        return slide

    all_dates.sort()
    min_date = datetime.strptime(all_dates[0][:10], '%Y-%m-%d')
    max_date = datetime.strptime(all_dates[-1][:10], '%Y-%m-%d')

    padding_days = max(7, int((max_date - min_date).days * 0.05))
    chart_start = min_date - timedelta(days=padding_days)
    chart_end = max_date + timedelta(days=padding_days)
    total_days = max((chart_end - chart_start).days, 1)

    label_width = Inches(2.8)
    chart_left = Inches(3.2)
    chart_width_in = 9.5
    chart_width = Inches(chart_width_in)
    chart_top = Inches(1.3)
    row_height = Inches(0.35)
    epic_header_height = Inches(0.30)
    milestone_dot_size = Inches(0.18)

    def date_to_x(date_str):
        d = datetime.strptime(date_str[:10], '%Y-%m-%d')
        frac = (d - chart_start).days / total_days
        return chart_left + Emu(int(chart_width_in * frac * 914400))

    bar_colors = ['#6366f1', '#8b5cf6', '#a78bfa', '#7c3aed', '#4f46e5', '#818cf8', '#c084fc', '#a855f7']

    _draw_month_axis(slide, chart_start, chart_end, chart_left, chart_width, chart_top, total_days, primary_color)

    y_cursor = chart_top + Inches(0.35)
    color_idx = 0

    for eg in epic_groups:
        epic_name = eg.get('epicName', 'Unnamed Epic')
        stages = eg.get('stages', [])
        ms_list = eg.get('milestones', [])

        if not stages and not ms_list:
            continue

        epic_label = slide.shapes.add_textbox(Inches(0.4), y_cursor, label_width, epic_header_height)
        tf = epic_label.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        run = p.add_run()
        run.text = epic_name
        set_font(run, size=9, bold=True, color=primary_color)
        y_cursor += epic_header_height

        for stage in stages:
            start_str = stage.get('startDate', '')
            end_str = stage.get('endDate', '')
            if not start_str or not end_str:
                continue

            stage_label = slide.shapes.add_textbox(Inches(0.6), y_cursor, label_width - Inches(0.2), row_height)
            tf = stage_label.text_frame
            tf.word_wrap = True
            p = tf.paragraphs[0]
            p.alignment = PP_ALIGN.RIGHT
            run = p.add_run()
            run.text = stage.get('name', '')
            set_font(run, size=8, color='#333333')

            bar_left = date_to_x(start_str)
            bar_right = date_to_x(end_str)
            bar_w = max(bar_right - bar_left, Emu(int(914400 * 0.1)))
            bar_h = Inches(0.22)
            bar_top = y_cursor + Inches(0.06)

            bar_color = bar_colors[color_idx % len(bar_colors)]
            bar = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, bar_left, bar_top, bar_w, bar_h)
            bar.fill.solid()
            bar.fill.fore_color.rgb = hex_to_rgb(bar_color)
            bar.line.fill.background()

            if bar_w > Emu(int(914400 * 1.2)):
                bar_tf = bar.text_frame
                bar_tf.word_wrap = False
                bp = bar_tf.paragraphs[0]
                bp.alignment = PP_ALIGN.CENTER
                brun = bp.add_run()
                s = datetime.strptime(start_str[:10], '%Y-%m-%d')
                e = datetime.strptime(end_str[:10], '%Y-%m-%d')
                brun.text = f"{s.strftime('%b %d')} – {e.strftime('%b %d')}"
                set_font(brun, size=6, color='#FFFFFF', bold=True)

            y_cursor += row_height
            color_idx += 1

        for ms in ms_list:
            if not ms.get('targetDate'):
                continue
            _draw_milestone_dot(slide, ms, date_to_x, y_cursor, label_width, secondary_color, milestone_dot_size)
            y_cursor += Inches(0.28)

    if unlinked_milestones:
        ul_label = slide.shapes.add_textbox(Inches(0.4), y_cursor, label_width, epic_header_height)
        tf = ul_label.text_frame
        p = tf.paragraphs[0]
        run = p.add_run()
        run.text = "Project Milestones"
        set_font(run, size=9, bold=True, color=primary_color)
        y_cursor += epic_header_height

        for ms in unlinked_milestones:
            if not ms.get('targetDate'):
                continue
            _draw_milestone_dot(slide, ms, date_to_x, y_cursor, label_width, secondary_color, milestone_dot_size)
            y_cursor += Inches(0.28)

    return slide


def _draw_month_axis(slide, chart_start, chart_end, chart_left, chart_width, chart_top, total_days, primary_color):
    """Draw month labels along the top axis of the Gantt chart."""
    chart_width_in = 9.5

    axis_line = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, chart_left, chart_top + Inches(0.28), chart_width, Inches(0.01))
    axis_line.fill.solid()
    axis_line.fill.fore_color.rgb = hex_to_rgb('#cccccc')
    axis_line.line.fill.background()

    current = datetime(chart_start.year, chart_start.month, 1)
    while current <= chart_end:
        if current >= chart_start:
            frac = (current - chart_start).days / total_days
            x = chart_left + Emu(int(chart_width_in * frac * 914400))

            tick = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, chart_top + Inches(0.25), Inches(0.01), Inches(0.06))
            tick.fill.solid()
            tick.fill.fore_color.rgb = hex_to_rgb('#aaaaaa')
            tick.line.fill.background()

            label_box = slide.shapes.add_textbox(x - Inches(0.3), chart_top, Inches(0.8), Inches(0.25))
            tf = label_box.text_frame
            tf.word_wrap = False
            p = tf.paragraphs[0]
            p.alignment = PP_ALIGN.CENTER
            run = p.add_run()
            run.text = current.strftime('%b %Y')
            set_font(run, size=7, color='#666666')

        if current.month == 12:
            current = datetime(current.year + 1, 1, 1)
        else:
            current = datetime(current.year, current.month + 1, 1)


def _draw_milestone_dot(slide, ms, date_to_x, y_cursor, label_width, secondary_color, dot_size):
    """Draw a single milestone as a diamond dot with label."""
    target = ms.get('targetDate', '')
    if not target:
        return

    x = date_to_x(target)
    dot_top = y_cursor + Inches(0.04)

    status = ms.get('status', '')
    if status == 'completed':
        dot_color = '#22c55e'
    elif status == 'in-progress':
        dot_color = '#3b82f6'
    else:
        dot_color = secondary_color

    dot = slide.shapes.add_shape(MSO_SHAPE.DIAMOND, x - dot_size // 2, dot_top, dot_size, dot_size)
    dot.fill.solid()
    dot.fill.fore_color.rgb = hex_to_rgb(dot_color)
    dot.line.fill.background()

    ms_label = slide.shapes.add_textbox(Inches(0.6), y_cursor, label_width - Inches(0.2), Inches(0.25))
    tf = ms_label.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.RIGHT
    run = p.add_run()
    ms_name = ms.get('name', '')
    is_payment = ms.get('isPayment', False)
    label_suffix = ' $' if is_payment else ''
    d = datetime.strptime(target[:10], '%Y-%m-%d')
    run.text = f"{ms_name}{label_suffix} ({d.strftime('%b %d')})"
    set_font(run, size=7, color='#555555', italic=True)


def _draw_milestone_table_fallback(slide, milestones, primary_color):
    """Fallback: draw a simple milestone table when no Gantt data is available."""
    if not milestones:
        note_box = slide.shapes.add_textbox(Inches(1), Inches(2), Inches(10), Inches(1))
        tf = note_box.text_frame
        p = tf.paragraphs[0]
        run = p.add_run()
        run.text = "No milestones defined for this project."
        set_font(run, size=12, color='#666666')
        return

    num_rows = min(len(milestones) + 1, 16)
    table = slide.shapes.add_table(num_rows, 4, Inches(0.4), Inches(1.1), Inches(12.4), Inches(0.35 * num_rows)).table
    table.columns[0].width = Inches(5.0)
    table.columns[1].width = Inches(2.5)
    table.columns[2].width = Inches(2.5)
    table.columns[3].width = Inches(2.4)

    headers = ['Milestone', 'Target Date', 'Status', 'Dates']
    for i, header in enumerate(headers):
        set_cell_text(table.cell(0, i), header, size=9, bold=True, bg_color=primary_color, color=RGBColor(255, 255, 255))

    for row_idx, ms in enumerate(milestones[:15]):
        r = row_idx + 1
        set_cell_text(table.cell(r, 0), ms.get('name', ''), size=9)
        set_cell_text(table.cell(r, 1), ms.get('targetDate', ''), size=9)

        status = ms.get('status', '')
        status_color = None
        if status == 'completed':
            status_color = '#22c55e'
        elif status == 'in-progress':
            status_color = '#3b82f6'
        elif status == 'not-started':
            status_color = '#9ca3af'
        set_cell_text(table.cell(r, 2), status.replace('-', ' ').title(), size=9, color=status_color)

        dates = ''
        if ms.get('startDate') and ms.get('endDate'):
            dates = f"{ms['startDate']} – {ms['endDate']}"
        elif ms.get('startDate'):
            dates = ms['startDate']
        set_cell_text(table.cell(r, 3), dates, size=9)

def generate_pptx(data, output_path):
    primary_color = data.get('primaryColor', '#810FFB')
    secondary_color = data.get('secondaryColor', '#E60CB3')

    ai_report = data.get('aiReport', '')
    sections = parse_markdown_sections(ai_report) if ai_report else {}

    prs = Presentation()
    prs.slide_width = SLIDE_WIDTH
    prs.slide_height = SLIDE_HEIGHT

    create_title_slide(prs, data, primary_color, secondary_color)
    create_progress_summary_slide(prs, data, sections, primary_color, secondary_color)
    create_accomplishments_slide(prs, data, sections, primary_color, secondary_color)
    create_raidd_slide(prs, data, sections, primary_color, secondary_color)
    create_upcoming_slide(prs, data, sections, primary_color, secondary_color)
    create_timeline_slide(prs, data, primary_color, secondary_color)

    prs.save(output_path)
    return output_path

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: generate_status_report_pptx.py <output_path>", file=sys.stderr)
        sys.exit(1)

    output_path = sys.argv[1]
    input_data = json.load(sys.stdin)
    result = generate_pptx(input_data, output_path)
    print(json.dumps({"success": True, "path": result}))
