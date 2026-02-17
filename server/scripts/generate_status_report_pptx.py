#!/usr/bin/env python3
"""
Generate a branded PowerPoint status report from AI-generated narrative content.
Reads JSON data from stdin, outputs PPTX to the path specified as first argument.
"""

import sys
import json
import os
import re
from datetime import datetime
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

    summary_text = sections.get('Progress Summary', '')
    if summary_text:
        render_markdown_text(tf, summary_text, primary_color, size=11)
    else:
        desc = data.get('projectDescription', '')
        if desc:
            p = tf.paragraphs[0]
            run = p.add_run()
            run.text = desc
            set_font(run, size=11)

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
    """Slide 6: Timeline & Milestones table."""
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    add_accent_bar(slide, primary_color, top=0)

    txBox = slide.shapes.add_textbox(Inches(0.8), Inches(0.3), Inches(10), Inches(0.6))
    tf = txBox.text_frame
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = "Timeline & Milestones"
    set_font(run, size=24, bold=True, color=primary_color)

    milestones = data.get('milestones', [])
    if not milestones:
        note_box = slide.shapes.add_textbox(Inches(1), Inches(2), Inches(10), Inches(1))
        tf = note_box.text_frame
        p = tf.paragraphs[0]
        run = p.add_run()
        run.text = "No milestones defined for this project."
        set_font(run, size=12, color='#666666')
        return slide

    num_rows = min(len(milestones) + 1, 16)
    table = slide.shapes.add_table(num_rows, 5, Inches(0.4), Inches(1.1), Inches(12.4), Inches(0.35 * num_rows)).table
    table.columns[0].width = Inches(4.0)
    table.columns[1].width = Inches(2.0)
    table.columns[2].width = Inches(2.0)
    table.columns[3].width = Inches(2.2)
    table.columns[4].width = Inches(2.2)

    headers = ['Milestone', 'Target Date', 'Status', 'Start Date', 'End Date']
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
        set_cell_text(table.cell(r, 3), ms.get('startDate', ''), size=9)
        set_cell_text(table.cell(r, 4), ms.get('endDate', ''), size=9)

    return slide

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
